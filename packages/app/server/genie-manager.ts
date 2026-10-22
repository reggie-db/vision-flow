import { createHash } from 'node:crypto';
import { withAdvisoryLock } from '@dbx-tools/postgres';
import { z } from 'zod';
import { config } from './config.ts';
import { database } from './database.ts';
import { DatabricksApiError, databricksJson } from './databricks-api.ts';

const GenieSpaceSchema = z.object({
  serialized_space: z.string(),
  etag: z.string(),
});

type JsonRecord = Record<string, unknown>;

function stableId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function source(identifier: string, columns: Record<string, string>): JsonRecord {
  return {
    identifier,
    column_configs: Object.entries(columns)
      .map(([column_name, description]) => ({ column_name, description: [description] }))
      .sort((left, right) => left.column_name.localeCompare(right.column_name)),
  };
}

function configuredSources(): JsonRecord[] {
  const documents = `${config.genieCatalog}.${config.genieSchema}.${config.documentsTable}`;
  const schemas = `${config.genieCatalog}.${config.genieSchema}.${config.schemaRegistryView}`;
  return [
    source(documents, {
      document_id: 'Pseudo-primary identifier for one immutable uploaded image.',
      schema_id: `Schema fingerprint. Join to ${schemas}.fingerprint to understand nested payload fields.`,
      category_id: 'Lakebase category UUID associated with the selected schema.',
      schema_version: 'Immutable schema version used for extraction.',
      schema_slug: 'Stable schema category identifier.',
      source_path: 'Unity Catalog Volume path of the source image. Exclude from answers unless specifically requested.',
      processing_status: 'completed or failed processing outcome. Filter to completed for scan analysis.',
      document_type_match: 'True when the strong model confirmed the image matches the selected schema.',
      needs_review: 'True for mismatch, missing required data, low confidence, or processing failure.',
      generic_description: 'Domain-neutral image description suitable for broad text search.',
      full_text: 'Visible text transcribed in reading order.',
      search_text: 'Concatenated description, visible text, extracted values, and evidence for broad case-insensitive matching.',
      payload: 'Nested VARIANT extraction. Schema-defined field envelopes are under payload:fields and contain value, confidence, and evidence.',
      warnings: 'Extraction and validation warnings.',
      error: 'Processing error for failed rows.',
      model_service: 'Strong model service used for extraction.',
      processed_at: 'UTC processing completion timestamp.',
    }),
    source(schemas, {
      category_id: 'Lakebase category UUID.',
      display_name: 'Human-readable schema name used in the scanner and dashboard tabs.',
      slug: 'Stable schema category identifier.',
      description: 'Human-readable purpose of the OCR schema.',
      status: 'Schema readiness state. This view contains active ready schemas.',
      active_schema_version: 'Current immutable schema version.',
      fingerprint: `SHA-256 schema identifier. Join to ${documents}.schema_id.`,
      contract: 'VARIANT contract with schema intent, extraction instructions, and field definitions.',
      extraction_schema: 'VARIANT JSON Schema supplied to the strong extraction model.',
      search_text: 'Schema descriptions, extraction instructions, and field hints.',
    }),
  ];
}

function instructions(): string[] {
  const documents = `${config.genieCatalog}.${config.genieSchema}.${config.documentsTable}`;
  const schemas = `${config.genieCatalog}.${config.genieSchema}.${config.schemaRegistryView}`;
  return [
    `Use ${documents} for OCR results and ${schemas} for schema context.`,
    `Join ${documents}.schema_id = ${schemas}.fingerprint before interpreting schema-specific payload fields.`,
    "Filter processing_status = 'completed' for successful results. Filter needs_review = false when the user asks for trusted automated results.",
    'The payload column is VARIANT. Read a scalar with payload:fields.<field>.value, its confidence with payload:fields.<field>.confidence, and source support with payload:fields.<field>.evidence.',
    'Use variant_explode for array fields described by the schema contract. Inspect contract:fields when the requested field path is not known.',
    'Use search_text with case-insensitive matching for broad scan text search. Use full_text when the user specifically asks about visible transcribed text.',
    'Confidence values are model self-assessments, not calibrated probabilities. Mention warnings and review status when they affect the answer.',
    'Never invent a field path. If the schema registry does not define the requested field, explain that the active schema does not provide it.',
  ];
}

async function updateSpace(includeEtag = true): Promise<void> {
  const space = GenieSpaceSchema.parse(
    await databricksJson(
      `/api/2.0/genie/spaces/${encodeURIComponent(config.genieSpaceId)}?include_serialized_space=true`,
      { signal: AbortSignal.timeout(20_000) },
    ),
  );
  const sources = configuredSources();
  if (sources.length > config.genieMaxTables) {
    throw new Error(`OCR requires ${sources.length} Genie sources, above the configured limit of ${config.genieMaxTables}.`);
  }

  const serialized = record(JSON.parse(space.serialized_space));
  serialized.version = 2;
  serialized.data_sources = { ...record(serialized.data_sources), tables: sources };
  serialized.instructions = {
    ...record(serialized.instructions),
    text_instructions: [{ id: stableId('dynamic-ocr-instructions'), content: [instructions().join('\n\n')] }],
    join_specs: [],
  };

  await databricksJson(`/api/2.0/genie/spaces/${encodeURIComponent(config.genieSpaceId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: 'OCR',
      description: 'Natural-language analysis of schema-defined OCR scans and processing metadata.',
      warehouse_id: config.genieWarehouseId,
      serialized_space: `${JSON.stringify(serialized, null, 2)}\n`,
      ...(includeEtag ? { etag: space.etag } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });
}

export async function ensureOcrGenieSpace(): Promise<void> {
  await withAdvisoryLock(database, ['dynamic-ocr', 'genie-space', config.genieSpaceId], async () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        await updateSpace();
        return;
      } catch (error) {
        if (!(error instanceof DatabricksApiError) || error.status !== 409) throw error;
      }
    }
    await updateSpace(false);
  });
}
