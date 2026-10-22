import { configUtils } from '@dbx-tools/core';
import { z } from 'zod';

const CONFIG_OPTIONS = { scope: [] as const, cwd: process.cwd() };

function required(name: string): string {
  const value = configUtils.string(undefined, name, CONFIG_OPTIONS)?.trim();
  if (!value) throw new Error(`Missing required configuration ${name}.`);
  return value;
}

function optional(name: string): string | undefined {
  const value = configUtils.string(undefined, name, CONFIG_OPTIONS)?.trim();
  return value ? value : undefined;
}

const modelService = required('OCR_MODEL_SERVICE');
const workspaceHost = optional('OCR_WORKSPACE_HOST') ?? required('DATABRICKS_HOST');

export const config = Object.freeze({
  modelService,
  dashboardModelService: optional('OCR_DASHBOARD_MODEL_SERVICE') ?? modelService,
  embeddingEndpoint: required('OCR_EMBEDDING_ENDPOINT'),
  volumeFullName: required('OCR_VOLUME_FULL_NAME'),
  lakebaseProject: required('OCR_LAKEBASE_PROJECT'),
  lakebaseBranch: required('OCR_LAKEBASE_BRANCH'),
  lakebaseEndpoint: required('OCR_LAKEBASE_ENDPOINT'),
  lakebaseDatabase: required('OCR_LAKEBASE_DATABASE'),
  lakebaseRole: required('OCR_LAKEBASE_ROLE'),
  lakebaseSecretScope: required('OCR_LAKEBASE_SECRET_SCOPE'),
  lakebaseUserKey: required('OCR_LAKEBASE_USER_KEY'),
  lakebasePasswordKey: required('OCR_LAKEBASE_PASSWORD_KEY'),
  lakebaseConnection: required('OCR_LAKEBASE_CONNECTION'),
  genieCatalog: required('OCR_GENIE_CATALOG'),
  genieSchema: required('OCR_GENIE_SCHEMA'),
  metaSchema: required('OCR_META_SCHEMA'),
  documentsTable: required('OCR_DOCUMENTS_TABLE'),
  schemaRegistryView: required('OCR_SCHEMA_REGISTRY_VIEW'),
  genieSpaceId: required('OCR_GENIE_SPACE_ID'),
  genieWarehouseId: required('OCR_GENIE_WAREHOUSE_ID'),
  genieMaxTables: configUtils.positiveInt(undefined, 'OCR_GENIE_MAX_TABLES', 30, CONFIG_OPTIONS),
  dashboardId: optional('OCR_DASHBOARD_ID'),
  dashboardDisplayName: optional('OCR_DASHBOARD_DISPLAY_NAME') ?? 'OCR Analytics',
  workspaceHost: workspaceHost.replace(/\/$/, ''),
  mastraGenieIdentity: z.enum(['user', 'service-principal', 'auto']).parse(required('MASTRA_GENIE_IDENTITY')),
  reviewThreshold: configUtils.positiveNumber(undefined, 'OCR_REVIEW_THRESHOLD', 0.8, CONFIG_OPTIONS),
  pgHost: required('PGHOST'),
  pgPort: configUtils.positiveInt(undefined, 'PGPORT', 5432, CONFIG_OPTIONS),
  pgUser: required('OCR_PG_USER'),
  pgPassword: required('OCR_PG_PASSWORD'),
  pgSslMode: configUtils.string(undefined, 'PGSSLMODE', CONFIG_OPTIONS) ?? 'require',
});

export const volumeRoot = `/Volumes/${config.volumeFullName.replaceAll('.', '/')}`;
