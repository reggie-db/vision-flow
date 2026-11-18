import { createHash } from 'node:crypto';
import type { ArrayField, CategoryContract, ContractField, ScalarField } from '../shared/vision-contracts.ts';

export const DEFAULT_CATEGORY_SLUG = 'machine_sales_document';

export const DEFAULT_CATEGORY_CONTRACT: CategoryContract = {
  documentIntent: 'A machine-generated sales image or settlement report that records products or units sold.',
  extractionInstructions:
    'Extract the jurisdiction, quantity sold, price, transaction date, and retailer or machine address when visible. Do not infer missing values.',
  fields: [
    {
      name: 'jurisdiction',
      label: 'State or jurisdiction',
      description: 'State, province, or jurisdiction visible in the image.',
      type: 'string',
      required: true,
    },
    {
      name: 'quantity_sold',
      label: 'Quantity sold',
      description: 'Number of products, tickets, plays, or other units reported as sold.',
      type: 'integer',
      required: true,
    },
    {
      name: 'price',
      label: 'Price',
      description: 'Reported unit price or total sales amount, using the amount explicitly shown in the image.',
      type: 'currency',
      required: true,
    },
    {
      name: 'transaction_date',
      label: 'Date',
      description: 'Transaction, settlement, or report date visible in the image.',
      type: 'date',
      required: true,
    },
    {
      name: 'address',
      label: 'Address',
      description: 'Retailer, store, terminal, or machine address when present.',
      type: 'string',
      required: false,
    },
    {
      name: 'machine_id',
      label: 'Machine or terminal ID',
      description: 'Terminal, vending machine, retailer, or location identifier when present.',
      type: 'string',
      required: false,
    },
  ],
};

export function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, ' ').replaceAll(/\s+/g, ' ').trim();
}

export function normalizeSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
    .slice(0, 48);
  if (!/^[a-z][a-z0-9_]{2,47}$/.test(slug)) throw new Error('The proposed category name is not a valid identifier.');
  if (['categories', 'schema_versions', 'uploads', 'extraction_attempts'].includes(slug)) {
    throw new Error('The proposed category name is reserved.');
  }
  return slug;
}

export function humanReadableDisplayName(value: string): string {
  const normalized = value
    .trim()
    .replaceAll(/[_-]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .replace(/\s+(document|image|query|schema|category)$/i, '')
    .replace(/^us\b/i, 'U.S.')
    .trim();
  return normalized || 'Extraction schema';
}

function canonicalScalar(field: ScalarField) {
  return {
    name: field.name,
    type: field.type,
    required: field.required,
  };
}

function canonicalField(field: ContractField) {
  return field.type === 'array'
    ? {
        name: field.name,
        type: field.type,
        required: field.required,
        itemFields: [...field.itemFields].sort((left, right) => left.name.localeCompare(right.name)).map(canonicalScalar),
      }
    : canonicalScalar(field);
}

export function canonicalContract(contract: CategoryContract): string {
  return JSON.stringify({
    documentIntent: normalizePrompt(contract.documentIntent),
    fields: [...contract.fields].sort((left, right) => left.name.localeCompare(right.name)).map(canonicalField),
  });
}

export function contractFingerprint(contract: CategoryContract): string {
  return createHash('sha256').update(canonicalContract(contract)).digest('hex');
}

export function contractSearchText(slug: string, description: string, contract: CategoryContract): string {
  const fields = contract.fields
    .flatMap((field) =>
      field.type === 'array'
        ? [`${field.name}: ${field.description}`, ...field.itemFields.map((item) => `${field.name}.${item.name}: ${item.description}`)]
        : [`${field.name}: ${field.description}`],
    )
    .join('\n');
  return [slug, description, contract.documentIntent, contract.extractionInstructions, fields].join('\n');
}

function valueSchema(field: ScalarField): Record<string, unknown> {
  const primitive =
    field.type === 'integer'
      ? 'integer'
      : field.type === 'number' || field.type === 'currency'
        ? 'number'
        : field.type === 'boolean'
          ? 'boolean'
          : 'string';
  const value: Record<string, unknown> = { type: [primitive, 'null'] };
  if (field.type === 'date') value.format = 'date';
  return {
    type: 'object',
    additionalProperties: false,
    required: ['value', 'confidence', 'evidence'],
    properties: {
      value,
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      evidence: { type: ['string', 'null'] },
    },
  };
}

function arraySchema(field: ArrayField): Record<string, unknown> {
  return {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: field.itemFields.map((item) => item.name),
      properties: Object.fromEntries(field.itemFields.map((item) => [item.name, valueSchema(item)])),
    },
  };
}

export function extractionJsonSchema(contract: CategoryContract): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['document_type_match', 'generic_description', 'full_text', 'warnings', 'fields'],
    properties: {
      document_type_match: { type: 'boolean' },
      generic_description: {
        type: 'string',
        minLength: 1,
        maxLength: 1_000,
        description: 'Domain-neutral description of the visible image content for full-text search.',
      },
      full_text: {
        type: 'string',
        minLength: 1,
        maxLength: 20_000,
        description: 'Visible text transcribed from the image in reading order.',
      },
      warnings: { type: 'array', items: { type: 'string' } },
      fields: {
        type: 'object',
        additionalProperties: false,
        required: contract.fields.map((field) => field.name),
        properties: Object.fromEntries(
          contract.fields.map((field) => [field.name, field.type === 'array' ? arraySchema(field) : valueSchema(field)]),
        ),
      },
    },
  };
}

export function requiredFieldNames(contract: CategoryContract): string[] {
  return contract.fields.filter((field) => field.required).map((field) => field.name);
}
