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

const modelService = required('VISION_FLOW_MODEL_SERVICE');
const workspaceHost = optional('VISION_FLOW_WORKSPACE_HOST') ?? required('DATABRICKS_HOST');

export const config = Object.freeze({
  modelService,
  dashboardModelService: optional('VISION_FLOW_DASHBOARD_MODEL_SERVICE') ?? modelService,
  embeddingEndpoint: required('VISION_FLOW_EMBEDDING_ENDPOINT'),
  volumeFullName: required('VISION_FLOW_VOLUME_FULL_NAME'),
  lakebaseProject: required('VISION_FLOW_LAKEBASE_PROJECT'),
  lakebaseBranch: required('VISION_FLOW_LAKEBASE_BRANCH'),
  lakebaseEndpoint: required('VISION_FLOW_LAKEBASE_ENDPOINT'),
  lakebaseDatabase: required('VISION_FLOW_LAKEBASE_DATABASE'),
  lakebaseRole: required('VISION_FLOW_LAKEBASE_ROLE'),
  lakebaseSecretScope: required('VISION_FLOW_LAKEBASE_SECRET_SCOPE'),
  lakebaseUserKey: required('VISION_FLOW_LAKEBASE_USER_KEY'),
  lakebasePasswordKey: required('VISION_FLOW_LAKEBASE_PASSWORD_KEY'),
  lakebaseConnection: required('VISION_FLOW_LAKEBASE_CONNECTION'),
  genieCatalog: required('VISION_FLOW_GENIE_CATALOG'),
  genieSchema: required('VISION_FLOW_GENIE_SCHEMA'),
  metaSchema: required('VISION_FLOW_META_SCHEMA'),
  documentsTable: required('VISION_FLOW_DOCUMENTS_TABLE'),
  schemaRegistryView: required('VISION_FLOW_SCHEMA_REGISTRY_VIEW'),
  genieSpaceId: required('VISION_FLOW_GENIE_SPACE_ID'),
  genieWarehouseId: required('VISION_FLOW_GENIE_WAREHOUSE_ID'),
  genieMaxTables: configUtils.positiveInt(undefined, 'VISION_FLOW_GENIE_MAX_TABLES', 30, CONFIG_OPTIONS),
  dashboardId: optional('VISION_FLOW_DASHBOARD_ID'),
  dashboardDisplayName: optional('VISION_FLOW_DASHBOARD_DISPLAY_NAME') ?? 'Vision Flow Analytics',
  workspaceHost: workspaceHost.replace(/\/$/, ''),
  mastraGenieIdentity: z.enum(['user', 'service-principal', 'auto']).parse(required('MASTRA_GENIE_IDENTITY')),
  reviewThreshold: configUtils.positiveNumber(undefined, 'VISION_FLOW_REVIEW_THRESHOLD', 0.8, CONFIG_OPTIONS),
  pgHost: required('PGHOST'),
  pgPort: configUtils.positiveInt(undefined, 'PGPORT', 5432, CONFIG_OPTIONS),
  pgUser: required('VISION_FLOW_PG_USER'),
  pgPassword: required('VISION_FLOW_PG_PASSWORD'),
  pgSslMode: configUtils.string(undefined, 'PGSSLMODE', CONFIG_OPTIONS) ?? 'require',
});

export const volumeRoot = `/Volumes/${config.volumeFullName.replaceAll('.', '/')}`;
