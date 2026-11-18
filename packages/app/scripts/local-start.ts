import { client } from '@dbx-tools/auth';
import { configUtils } from '@dbx-tools/core';
import { createLakebaseClient } from '@dbx-tools/lakebase';
import { z } from 'zod';

const profile = process.env.DATABRICKS_CONFIG_PROFILE ?? process.env.DATABRICKS_PROFILE ?? 'DEFAULT';
const bundle = configUtils.bundleFile(new URL('..', import.meta.url).pathname, profile)?.data;
const variables = z
  .record(z.string(), z.object({ value: z.unknown().optional(), default: z.unknown().optional() }).passthrough())
  .parse((bundle as { variables?: unknown } | undefined)?.variables);

function variable(name: string): string {
  const entry = variables[name];
  const value = entry?.value ?? entry?.default;
  return z.string().min(1).parse(String(value));
}

const auth = await client.createAuthClient({ profile });
const dashboardDisplayName = variable('dashboard_display_name');
const dashboardResponse = await fetch(`${auth.host.replace(/\/$/, '')}/api/2.0/lakeview/dashboards?page_size=100`, {
  headers: await auth.headers(),
});
if (!dashboardResponse.ok) throw new Error(`Could not list dashboards: ${await dashboardResponse.text()}`);
const dashboardPayload = (await dashboardResponse.json()) as {
  dashboards?: Array<{ dashboard_id?: string; display_name?: string; lifecycle_state?: string }>;
};
const dashboardId = dashboardPayload.dashboards?.find(
  (dashboard) => dashboard.display_name === dashboardDisplayName && dashboard.lifecycle_state !== 'TRASHED',
)?.dashboard_id;
const secretScope = variable('lakebase_secret_scope');
const passwordKey = variable('lakebase_password_key');
const secretResponse = await fetch(
  `${auth.host.replace(/\/$/, '')}/api/2.0/secrets/get?scope=${encodeURIComponent(secretScope)}&key=${encodeURIComponent(passwordKey)}`,
  { headers: await auth.headers() },
);
if (!secretResponse.ok) {
  throw new Error(`Could not read ${secretScope}/${passwordKey}: ${await secretResponse.text()}`);
}
const secret = z.object({ value: z.string().min(1) }).parse(await secretResponse.json());
const password = Buffer.from(secret.value, 'base64').toString('utf8');

const project = variable('lakebase_project_id');
const branch = variable('lakebase_branch_id');
const endpointId = variable('lakebase_endpoint_id');
const databaseName = variable('lakebase_database_name');
const roleName = variable('lakebase_role_name');
const resolved = await createLakebaseClient({ profile }).resolve(
  { project, branch, endpointId, database: databaseName },
  profile,
);
const volumeFullName = variable('documents_volume');

Object.assign(process.env, {
  NODE_ENV: process.env.NODE_ENV ?? 'production',
  DATABRICKS_CONFIG_PROFILE: profile,
  DATABRICKS_VOLUME_FILES: `/Volumes/${volumeFullName.replaceAll('.', '/')}`,
  VISION_FLOW_MODEL_SERVICE: variable('quick_model_service'),
  VISION_FLOW_DASHBOARD_MODEL_SERVICE: variable('dashboard_model_service'),
  VISION_FLOW_EMBEDDING_ENDPOINT: variable('embedding_endpoint'),
  VISION_FLOW_VOLUME_FULL_NAME: volumeFullName,
  VISION_FLOW_LAKEBASE_PROJECT: project,
  VISION_FLOW_LAKEBASE_BRANCH: branch,
  VISION_FLOW_LAKEBASE_ENDPOINT: resolved.endpoint,
  VISION_FLOW_LAKEBASE_DATABASE: databaseName,
  VISION_FLOW_LAKEBASE_ROLE: roleName,
  VISION_FLOW_LAKEBASE_SECRET_SCOPE: secretScope,
  VISION_FLOW_LAKEBASE_USER_KEY: variable('lakebase_user_key'),
  VISION_FLOW_LAKEBASE_PASSWORD_KEY: passwordKey,
  VISION_FLOW_LAKEBASE_CONNECTION: variable('lakebase_connection'),
  VISION_FLOW_GENIE_CATALOG: variable('genie_catalog'),
  VISION_FLOW_GENIE_SCHEMA: variable('genie_schema'),
  VISION_FLOW_META_SCHEMA: variable('meta_schema'),
  VISION_FLOW_DOCUMENTS_TABLE: variable('documents_table'),
  VISION_FLOW_SCHEMA_REGISTRY_VIEW: variable('schema_registry_view'),
  VISION_FLOW_GENIE_SPACE_ID: variable('genie_space_id'),
  VISION_FLOW_GENIE_WAREHOUSE_ID: variable('genie_warehouse_id'),
  VISION_FLOW_GENIE_MAX_TABLES: variable('genie_max_tables'),
  ...(dashboardId ? { VISION_FLOW_DASHBOARD_ID: dashboardId } : {}),
  VISION_FLOW_DASHBOARD_DISPLAY_NAME: dashboardDisplayName,
  VISION_FLOW_WORKSPACE_HOST: variable('workspace_host'),
  MASTRA_GENIE_IDENTITY: variable('mastra_genie_identity'),
  VISION_FLOW_REVIEW_THRESHOLD: variable('review_threshold'),
  VISION_FLOW_PG_USER: roleName,
  VISION_FLOW_PG_PASSWORD: password,
  LAKEBASE_ENDPOINT: resolved.endpoint,
  PGROLE: roleName,
  DBX_TOOLS_POSTGRES_ROLE: roleName,
  PGHOST: resolved.host,
  PGPORT: String(resolved.port),
  PGDATABASE: databaseName,
  PGSSLMODE: 'require',
});

console.log(`Starting Vision Flow with Databricks profile ${profile} and shared role ${roleName}.`);
await import('../server/server.ts');
