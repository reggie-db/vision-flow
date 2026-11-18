import { z } from 'zod';
import {
  CategoryContractSchema,
  CaptureGuideSchema,
  type CaptureGuide,
  ImageGateResultSchema,
  type CategoryContract,
  type ContractField,
  type ImageGateResult,
} from '../shared/vision-contracts.ts';
import { config } from './config.ts';
import { databricksFetch } from './databricks-api.ts';
import { extractionJsonSchema, requiredFieldNames } from './schema-contract.ts';

const GatewayResponseSchema = z.object({
  output: z.array(
    z.object({
      content: z.array(z.object({ text: z.string().optional() })).optional(),
    }),
  ),
});

const EmbeddingResponseSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()) })).min(1),
});

export const CategoryDecisionSchema = z.object({
  action: z.enum(['reuse', 'create', 'clarify']),
  matchedCategoryId: z.string().uuid().nullable(),
  categorySlug: z.string().nullable(),
  displayName: z.string().min(1).max(100).nullable(),
  description: z.string().nullable(),
  clarification: z.string().nullable(),
  reasoningSummary: z.string(),
  captureGuide: CaptureGuideSchema,
  contract: CategoryContractSchema.nullable(),
});

export type CategoryDecision = z.infer<typeof CategoryDecisionSchema>;

export const DashboardPagePlanSchema = z.object({
  title: z.string().min(1).max(100),
  subtitle: z.string().min(1).max(300),
  metricField: z.string().nullable(),
  groupingField: z.string().nullable(),
  dateField: z.string().nullable(),
  detailFields: z.array(z.string()).max(8),
});

export type DashboardPagePlan = z.infer<typeof DashboardPagePlanSchema>;

interface CandidateCategory {
  id: string;
  displayName: string;
  slug: string;
  description: string;
  contract: CategoryContract;
  captureGuide: CaptureGuide;
  prompts: string[];
  similarity?: number;
}

async function structuredResponse<T>(
  name: string,
  schema: z.ZodType<T>,
  prompt: string,
  imageDataUrl?: string,
  options: {
    imageDetail?: 'low' | 'high';
    maxOutputTokens?: number;
    model?: string;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const content: Array<Record<string, unknown>> = [{ type: 'input_text', text: prompt }];
  if (imageDataUrl) {
    content.push({
      type: 'input_image',
      image_url: imageDataUrl,
      detail: options.imageDetail ?? 'high',
    });
  }
  const response = await databricksFetch('/ai-gateway/mlflow/v1/responses', {
    method: 'POST',
    body: JSON.stringify({
      model: options.model ?? config.modelService,
      input: [{ role: 'user', content }],
      text: {
        format: {
          type: 'json_schema',
          name,
          strict: true,
          schema: z.toJSONSchema(schema, { target: 'draft-7' }),
        },
      },
      max_output_tokens: options.maxOutputTokens ?? 4_096,
      reasoning: { effort: 'minimal' },
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? (imageDataUrl ? 30_000 : 60_000)),
  });
  if (!response.ok) throw new Error(`Model request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const parsed = GatewayResponseSchema.parse(await response.json());
  const text = parsed.output.flatMap((item) => item.content ?? []).flatMap((item) => item.text ?? []).join('').trim();
  return schema.parse(JSON.parse(text));
}

export async function embedText(text: string): Promise<number[]> {
  const response = await databricksFetch(`/serving-endpoints/${encodeURIComponent(config.embeddingEndpoint)}/invocations`, {
    method: 'POST',
    body: JSON.stringify({ input: [text] }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Embedding request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  return EmbeddingResponseSchema.parse(await response.json()).data[0]!.embedding;
}

export async function decideCategory(
  prompt: string,
  candidates: CandidateCategory[],
  captureGuide?: CaptureGuide,
): Promise<CategoryDecision> {
  return structuredResponse(
    'vision_category_decision',
    CategoryDecisionSchema,
    [
      'Resolve the requested image extraction into an existing category or a new immutable extraction contract.',
      'Reuse only when image meaning, requested fields, types, cardinality, and extraction intent match.',
      'For both reuse and create, return the complete proposed contract so structural equality can be verified deterministically.',
      'Do not enlarge an existing category to absorb new semantic fields. Clarify when the request is ambiguous.',
      'For a new category, use lowercase snake_case identifiers and include useful fields. Every field must have a precise description.',
      'For a new category, return a concise human-readable displayName in title case. Do not end it with Image, Document, Query, Schema, or Category. Keep internal identifiers in categorySlug only.',
      'Images with repeated line items should use one array field whose itemFields describe each item.',
      'Choose captureGuide=vertical for tall receipts, forms, or portrait documents; horizontal for IDs, cards, and landscape documents; none for open scenes such as counting objects or auditing a room.',
      captureGuide ? `The user explicitly selected captureGuide=${captureGuide}; return that exact value.` : 'Infer captureGuide from the requested subject.',
      `User request: ${prompt}`,
      `Candidates: ${JSON.stringify(candidates)}`,
    ].join('\n'),
  );
}

export async function quickImageGate(
  imageDataUrl: string,
  displayName: string,
  description: string,
  contract: CategoryContract,
): Promise<ImageGateResult> {
  return structuredResponse(
    'vision_image_gate',
    ImageGateResultSchema,
    [
      `Decide whether this image is a valid ${displayName} image: ${description}.`,
      `Schema intent: ${contract.documentIntent}`,
      `Required visible fields: ${requiredFieldNames(contract).join(', ') || 'none'}`,
      'This is only a fast base validation. Return valid=true when the image type matches and the required fields appear visible enough to parse.',
      'Return one short failure reason, or an empty reason when valid. List missing field identifiers exactly. Do not extract values.',
    ].join('\n'),
    imageDataUrl,
    {
      imageDetail: 'low',
      maxOutputTokens: 96,
      timeoutMs: 8_000,
    },
  );
}

function fieldSummary(field: ContractField): Record<string, unknown> {
  return field.type === 'array'
    ? {
        name: field.name,
        label: field.label,
        type: field.type,
        required: field.required,
        itemFields: field.itemFields.map((item) => ({ name: item.name, label: item.label, type: item.type })),
      }
    : {
        name: field.name,
        label: field.label,
        type: field.type,
        required: field.required,
      };
}

export async function generateDashboardPagePlan(
  displayName: string,
  description: string,
  contract: CategoryContract,
): Promise<DashboardPagePlan> {
  return structuredResponse(
    'vision_dashboard_page_plan',
    DashboardPagePlanSchema,
    [
      'Design one useful analytics dashboard page for structured extraction results created with this schema.',
      'Choose field identifiers only from the supplied scalar fields. Use null when no field is suitable.',
      'metricField should be numeric or currency. groupingField should be a low-cardinality string or boolean. dateField should be a date.',
      'detailFields should contain the most decision-useful scalar fields in display order.',
      'Write a concise title and a factual subtitle. Do not mention implementation details, JSON, schemas, prompts, or models.',
      `Display name: ${displayName}`,
      `Purpose: ${description}`,
      `Fields: ${JSON.stringify(contract.fields.map(fieldSummary))}`,
    ].join('\n'),
    undefined,
    {
      maxOutputTokens: 800,
      model: config.dashboardModelService,
      timeoutMs: 45_000,
    },
  );
}

export function categoryExtractionSchema(contract: CategoryContract): Record<string, unknown> {
  return extractionJsonSchema(contract);
}
