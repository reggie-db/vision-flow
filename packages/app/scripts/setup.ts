import { configUtils } from '@dbx-tools/core';
import { client } from '@dbx-tools/auth';
import { createLakebaseClient } from '@dbx-tools/lakebase';
import { postgresConnectionOptions, quotePostgresIdentifier } from '@dbx-tools/postgres';
import { Pool } from 'pg';
import { z } from 'zod';

const phase = z.enum(['secret', 'finalize']).parse(process.argv[2] ?? 'finalize');
const profile = process.env.DATABRICKS_CONFIG_PROFILE ?? process.env.DATABRICKS_PROFILE ?? 'DEFAULT';
const bundle = configUtils.bundleFile(new URL('..', import.meta.url).pathname, profile)?.data;
const variables = z
  .record(z.string(), z.object({ value: z.unknown().optional(), default: z.unknown().optional() }).passthrough())
  .parse((bundle as { variables?: unknown } | undefined)?.variables);

function variable(name: string): string {
  const value = z.union([z.string(), z.number(), z.boolean()]).parse(variables[name]?.value ?? variables[name]?.default);
  return z.string().min(1).parse(String(value));
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const auth = await client.createAuthClient({ profile });
  return fetch(`${auth.host.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { ...(await auth.headers()), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
}

async function ensureSecretScope(scope: string): Promise<void> {
  const listed = await request('/api/2.0/secrets/scopes/list');
  if (!listed.ok) throw new Error(`Could not list secret scopes: ${await listed.text()}`);
  const payload = await listed.json();
  const scopes = z.array(z.object({ name: z.string() })).parse(
    Array.isArray(payload) ? payload : (payload as { scopes?: unknown }).scopes,
  );
  if (scopes.some((item) => item.name === scope)) return;
  const created = await request('/api/2.0/secrets/scopes/create', {
    method: 'POST',
    body: JSON.stringify({ scope }),
  });
  if (!created.ok) throw new Error(`Could not create secret scope ${scope}: ${await created.text()}`);
}

async function storeSecret(scope: string, key: string, value: string): Promise<void> {
  const response = await request('/api/2.0/secrets/put', {
    method: 'POST',
    body: JSON.stringify({ scope, key, string_value: value }),
  });
  if (!response.ok) throw new Error(`Could not store ${scope}/${key}: ${await response.text()}`);
}

async function transferSchemaOwnership(pool: Pool, schemaName: string, roleName: string): Promise<void> {
  const schema = quotePostgresIdentifier(schemaName);
  const role = quotePostgresIdentifier(roleName);
  const exists = await pool.query<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS exists',
    [schemaName],
  );
  if (!exists.rows[0]?.exists) {
    await pool.query(`SET ROLE ${role}`);
    try {
      await pool.query(`CREATE SCHEMA ${schema} AUTHORIZATION ${role}`);
    } finally {
      await pool.query('RESET ROLE');
    }
    return;
  }
  await pool.query(`GRANT USAGE, CREATE ON SCHEMA ${schema} TO ${role}`);
  const relations = await pool.query<{ name: string; kind: string }>(
    `SELECT c.relname AS name, c.relkind AS kind
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1
        AND c.relkind IN ('r', 'p', 'v', 'm', 'f')`,
    [schemaName],
  );
  for (const relation of relations.rows) {
    const name = `${schema}.${quotePostgresIdentifier(relation.name)}`;
    const relationType =
      relation.kind === 'v'
          ? 'VIEW'
          : relation.kind === 'm'
            ? 'MATERIALIZED VIEW'
            : 'TABLE';
    await pool.query(`ALTER ${relationType} ${name} OWNER TO ${role}`);
  }
  await pool.query(`ALTER SCHEMA ${schema} OWNER TO ${role}`);
}

const secretScope = variable('lakebase_secret_scope');
const passwordKey = variable('lakebase_password_key');
const userKey = variable('lakebase_user_key');
const roleName = variable('lakebase_role_name');
const runtimePassword = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll('-', '')}`;
await ensureSecretScope(secretScope);
await storeSecret(secretScope, passwordKey, runtimePassword);
await storeSecret(secretScope, userKey, roleName);
console.log(`Stored a generated password in ${secretScope}/${passwordKey}.`);

if (phase === 'secret') process.exit(0);

const project = variable('lakebase_project_id');
const branch = variable('lakebase_branch_id');
const endpointId = variable('lakebase_endpoint_id');
const databaseName = variable('lakebase_database_name');
const lakebase = createLakebaseClient({ profile });
const resolved = await lakebase.resolve({ project, branch, endpointId, database: databaseName }, profile);
const oauthPassword = await lakebase.generateDatabaseCredential(resolved.endpoint, profile);
const adminPool = new Pool(
  postgresConnectionOptions({
    host: resolved.host,
    port: resolved.port,
    database: resolved.database,
    user: resolved.user,
    password: oauthPassword,
    ssl: { rejectUnauthorized: true },
    max: 1,
  }),
);
try {
  const currentUser = z.string().min(1).parse((await adminPool.query<{ current_user: string }>('SELECT current_user')).rows[0]?.current_user);
  const roleIdentifier = quotePostgresIdentifier(roleName);
  const passwordLiteral = `'${runtimePassword.replaceAll("'", "''")}'`;
  const existing = await adminPool.query<{ exists: boolean }>('SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1)', [roleName]);
  if (existing.rows[0]?.exists) {
    await adminPool.query(`ALTER ROLE ${roleIdentifier} WITH LOGIN PASSWORD ${passwordLiteral}`);
  } else {
    await adminPool.query(`CREATE ROLE ${roleIdentifier} WITH LOGIN PASSWORD ${passwordLiteral}`);
  }
  await adminPool.query(`GRANT ${roleIdentifier} TO ${quotePostgresIdentifier(currentUser)}`);
  await adminPool.query(
    `GRANT ${roleIdentifier} TO ${quotePostgresIdentifier(variable('app_service_principal_client_id'))}`,
  );
  await adminPool.query(`GRANT CONNECT, CREATE ON DATABASE ${quotePostgresIdentifier(databaseName)} TO ${roleIdentifier}`);
  await adminPool.query(`ALTER DATABASE ${quotePostgresIdentifier(databaseName)} OWNER TO ${roleIdentifier}`);
  const metaSchema = quotePostgresIdentifier(variable('meta_schema'));
  await adminPool.query(`CREATE SCHEMA IF NOT EXISTS ${metaSchema} AUTHORIZATION ${roleIdentifier}`);
  await adminPool.query(`ALTER SCHEMA ${metaSchema} OWNER TO ${roleIdentifier}`);
  for (const schemaName of ['mastra_instance', 'mastra_ocr_data', 'mastra_ocr_memory']) {
    await transferSchemaOwnership(adminPool, schemaName, roleName);
  }
} finally {
  await adminPool.end();
}
console.log(`Updated shared Lakebase role ${roleName}.`);

Object.assign(process.env, {
  OCR_MODEL_SERVICE: variable('quick_model_service'),
  OCR_DASHBOARD_MODEL_SERVICE: variable('dashboard_model_service'),
  OCR_EMBEDDING_ENDPOINT: variable('embedding_endpoint'),
  OCR_VOLUME_FULL_NAME: variable('documents_volume'),
  OCR_LAKEBASE_PROJECT: project,
  OCR_LAKEBASE_BRANCH: branch,
  OCR_LAKEBASE_ENDPOINT: resolved.endpoint,
  OCR_LAKEBASE_DATABASE: databaseName,
  OCR_LAKEBASE_ROLE: roleName,
  OCR_LAKEBASE_SECRET_SCOPE: secretScope,
  OCR_LAKEBASE_USER_KEY: userKey,
  OCR_LAKEBASE_PASSWORD_KEY: passwordKey,
  OCR_LAKEBASE_CONNECTION: variable('lakebase_connection'),
  OCR_GENIE_CATALOG: variable('genie_catalog'),
  OCR_GENIE_SCHEMA: variable('genie_schema'),
  OCR_META_SCHEMA: variable('meta_schema'),
  OCR_DOCUMENTS_TABLE: variable('documents_table'),
  OCR_SCHEMA_REGISTRY_VIEW: variable('schema_registry_view'),
  OCR_GENIE_SPACE_ID: variable('genie_space_id'),
  OCR_GENIE_WAREHOUSE_ID: variable('genie_warehouse_id'),
  OCR_GENIE_MAX_TABLES: variable('genie_max_tables'),
  OCR_DASHBOARD_DISPLAY_NAME: variable('dashboard_display_name'),
  OCR_WORKSPACE_HOST: variable('workspace_host'),
  MASTRA_GENIE_IDENTITY: variable('mastra_genie_identity'),
  OCR_REVIEW_THRESHOLD: variable('review_threshold'),
  OCR_PG_USER: roleName,
  OCR_PG_PASSWORD: runtimePassword,
  PGROLE: roleName,
  DBX_TOOLS_POSTGRES_ROLE: roleName,
  PGHOST: resolved.host,
  PGPORT: String(resolved.port),
  PGDATABASE: databaseName,
  PGSSLMODE: 'require',
  DATABRICKS_CONFIG_PROFILE: profile,
});

const [{ database }, { migrateRegistry }, { ensureDefaultCategory }, { ensureOcrStorage }, { ensureOcrGenieSpace }] = await Promise.all([
  import('../server/database.ts'),
  import('../server/migrations.ts'),
  import('../server/category-provisioner.ts'),
  import('../server/storage.ts'),
  import('../server/genie-manager.ts'),
]);
await migrateRegistry(database);
await ensureOcrStorage();
const category = await ensureDefaultCategory();
await ensureOcrGenieSpace();
await database.end();
console.log(`Lakebase registry initialized; default category ${category.slug} is ${category.status}.`);
