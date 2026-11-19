import type { PoolClient } from 'pg';
import { config } from './config.ts';
import { database } from './database.ts';
import type { DashboardPagePlan } from './model-gateway.ts';
import { normalizePrompt } from './schema-contract.ts';
import type { CaptureGuide, Category, CategoryContract } from '../shared/vision-contracts.ts';

interface CategoryRow {
  id: string;
  display_name: string;
  slug: string;
  fingerprint: string;
  description: string;
  status: Category['status'];
  active_schema_version: number;
  capture_guide: CaptureGuide;
  contract: CategoryContract;
  table_name: string;
  uc_table: string;
  volume_directory: string;
  prompts: Array<{ id: string; prompt: string; createdAt: string; canonical: boolean }> | null;
}

export interface CategoryCandidate {
  id: string;
  displayName: string;
  slug: string;
  description: string;
  captureGuide: CaptureGuide;
  contract: CategoryContract;
  prompts: string[];
  textRank?: number;
  similarity?: number;
}

export interface SchemaVersionRecord {
  categoryId: string;
  version: number;
  fingerprint: string;
  contract: CategoryContract;
  extractionSchema: Record<string, unknown>;
}

export interface DashboardCategoryRecord {
  id: string;
  displayName: string;
  description: string;
  fingerprint: string;
  contract: CategoryContract;
  dashboardPlan?: DashboardPagePlan;
}

function relation(table: string): string {
  return `"${config.metaSchema.replaceAll('"', '""')}"."${table}"`;
}

function mapCategory(row: CategoryRow): Category {
  const dashboardUrl = config.dashboardId
    ? `${config.workspaceHost}/sql/dashboardsv3/${config.dashboardId}/published`
    : `${config.workspaceHost}/sql/dashboards`;
  return {
    id: row.id,
    displayName: row.display_name,
    slug: row.slug,
    schemaId: row.fingerprint,
    description: row.description,
    status: row.status,
    activeSchemaVersion: row.active_schema_version,
    captureGuide: row.capture_guide,
    contract: row.contract,
    tableName: row.table_name,
    ucTable: row.uc_table,
    volumeDirectory: row.volume_directory,
    dashboardUrl,
    prompts: row.prompts ?? [],
  };
}

const categorySelect = `
  SELECT c.id, c.display_name, c.slug, c.description, c.status, c.active_schema_version, c.capture_guide,
         sv.fingerprint, sv.contract, c.table_name, c.uc_table, c.volume_directory,
         COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'prompt', p.prompt,
           'createdAt', p.created_at,
           'canonical', p.canonical
         ) ORDER BY p.created_at) FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb) AS prompts
  FROM ${relation('categories')} c
  JOIN ${relation('schema_versions')} sv
    ON sv.category_id = c.id AND sv.version = c.active_schema_version
  LEFT JOIN ${relation('category_prompts')} p ON p.category_id = c.id
`;

export async function listCategories(): Promise<Category[]> {
  const result = await database.query<CategoryRow>(
    `${categorySelect} GROUP BY c.id, sv.fingerprint, sv.contract ORDER BY c.created_at`
  );
  return result.rows.map(mapCategory);
}

export async function getCategory(categoryId: string): Promise<Category | undefined> {
  const result = await database.query<CategoryRow>(
    `${categorySelect} WHERE c.id = $1 GROUP BY c.id, sv.fingerprint, sv.contract`,
    [categoryId]
  );
  return result.rows[0] ? mapCategory(result.rows[0]) : undefined;
}

export async function findCategoryByPrompt(prompt: string): Promise<Category | undefined> {
  const result = await database.query<{ category_id: string }>(
    `SELECT category_id FROM ${relation('category_prompts')} WHERE normalized_prompt = $1`,
    [normalizePrompt(prompt)]
  );
  return result.rows[0] ? getCategory(result.rows[0].category_id) : undefined;
}

export async function findCategoryByFingerprint(
  fingerprint: string,
  client: PoolClient = database as never
): Promise<Category | undefined> {
  const result = await client.query<{ category_id: string }>(
    `SELECT category_id FROM ${relation('schema_versions')} WHERE fingerprint = $1`,
    [fingerprint]
  );
  return result.rows[0] ? getCategory(result.rows[0].category_id) : undefined;
}

export async function findCandidateCategories(
  prompt: string,
  embedding?: number[],
  limit = 5
): Promise<CategoryCandidate[]> {
  const textMatches = await database.query<{
    id: string;
    display_name: string;
    slug: string;
    description: string;
    capture_guide: CaptureGuide;
    contract: CategoryContract;
    prompts: string[];
    text_rank: number;
    similarity: number | null;
  }>(
    `WITH search_query AS (
       SELECT websearch_to_tsquery('english', $1) AS query
     ), prompt_scores AS (
       SELECT p.category_id, MAX(ts_rank_cd(p.search_document, search_query.query)) AS rank
         FROM ${relation('category_prompts')} p
         CROSS JOIN search_query
        WHERE p.search_document @@ search_query.query
        GROUP BY p.category_id
     )
     SELECT c.id, c.display_name, c.slug, c.description, c.capture_guide, sv.contract,
            COALESCE(array_agg(p.prompt) FILTER (WHERE p.prompt IS NOT NULL), ARRAY[]::text[]) AS prompts,
            GREATEST(ts_rank_cd(sv.search_document, search_query.query), COALESCE(prompt_scores.rank, 0)) AS text_rank,
            CASE WHEN $2::vector IS NULL THEN NULL ELSE 1 - (sv.embedding <=> $2::vector) END AS similarity
       FROM ${relation('schema_versions')} sv
       JOIN ${relation('categories')} c ON c.id = sv.category_id AND c.active_schema_version = sv.version
       LEFT JOIN ${relation('category_prompts')} p ON p.category_id = c.id
       LEFT JOIN prompt_scores ON prompt_scores.category_id = c.id
       CROSS JOIN search_query
      WHERE c.status = 'ready'
        AND (sv.search_document @@ search_query.query OR COALESCE(prompt_scores.rank, 0) > 0)
      GROUP BY c.id, sv.contract, sv.search_document, sv.embedding, search_query.query, prompt_scores.rank
      ORDER BY text_rank DESC, similarity DESC NULLS LAST
      LIMIT $3`,
    [prompt, embedding ? JSON.stringify(embedding) : null, limit]
  );
  if (textMatches.rows.length > 0 || !embedding) {
    return textMatches.rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      slug: row.slug,
      description: row.description,
      captureGuide: row.capture_guide,
      contract: row.contract,
      prompts: row.prompts,
      textRank: row.text_rank,
      similarity: row.similarity ?? undefined,
    }));
  }

  const result = await database.query<{
    id: string;
    display_name: string;
    slug: string;
    description: string;
    capture_guide: CaptureGuide;
    contract: CategoryContract;
    prompts: string[];
    similarity: number;
  }>(
    `SELECT c.id, c.display_name, c.slug, c.description, c.capture_guide, sv.contract,
            COALESCE(array_agg(p.prompt) FILTER (WHERE p.prompt IS NOT NULL), ARRAY[]::text[]) AS prompts,
            1 - (sv.embedding <=> $1::vector) AS similarity
       FROM ${relation('schema_versions')} sv
       JOIN ${relation('categories')} c ON c.id = sv.category_id AND c.active_schema_version = sv.version
       LEFT JOIN ${relation('category_prompts')} p ON p.category_id = c.id
      WHERE c.status = 'ready' AND sv.embedding IS NOT NULL
      GROUP BY c.id, sv.contract, sv.embedding
      ORDER BY sv.embedding <=> $1::vector
      LIMIT $2`,
    [JSON.stringify(embedding), limit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    slug: row.slug,
    description: row.description,
    captureGuide: row.capture_guide,
    contract: row.contract,
    prompts: row.prompts,
    similarity: row.similarity,
  }));
}

export async function addPrompt(
  categoryId: string,
  prompt: string,
  canonical = false,
  client: PoolClient = database as never
): Promise<void> {
  await client.query(
    `INSERT INTO ${relation('category_prompts')} (id, category_id, prompt, normalized_prompt, canonical)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (normalized_prompt) DO NOTHING`,
    [crypto.randomUUID(), categoryId, prompt.trim(), normalizePrompt(prompt), canonical]
  );
}

export async function deletePrompt(categoryId: string, promptId: string): Promise<boolean> {
  const result = await database.query(
    `DELETE FROM ${relation('category_prompts')} WHERE id = $1 AND category_id = $2`,
    [promptId, categoryId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function insertCategory(
  client: PoolClient,
  input: {
    id: string;
    displayName: string;
    slug: string;
    description: string;
    captureGuide: CaptureGuide;
    fingerprint: string;
    contract: CategoryContract;
    extractionSchema: Record<string, unknown>;
    searchText: string;
    embedding: number[];
    prompt: string;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO ${relation('categories')}
      (id, display_name, slug, description, status, active_schema_version, capture_guide, table_name, uc_table, volume_directory)
     VALUES ($1, $2, $3, $4, 'resolving', 1, $5, $6, $7, $3)`,
    [
      input.id,
      input.displayName,
      input.slug,
      input.description,
      input.captureGuide,
      config.documentsTable,
      `${config.genieCatalog}.${config.genieSchema}.${config.documentsTable}`,
    ]
  );
  await client.query(
    `INSERT INTO ${relation('schema_versions')}
      (category_id, version, fingerprint, contract, extraction_schema, search_text, embedding)
     VALUES ($1, 1, $2, $3::jsonb, $4::jsonb, $5, $6::vector)`,
    [
      input.id,
      input.fingerprint,
      JSON.stringify(input.contract),
      JSON.stringify(input.extractionSchema),
      input.searchText,
      JSON.stringify(input.embedding),
    ]
  );
  await addPrompt(input.id, input.prompt, true, client);
}

export async function setCategoryDashboardPlan(categoryId: string, plan: DashboardPagePlan): Promise<void> {
  await database.query(
    `UPDATE ${relation('categories')} SET dashboard_plan = $2::jsonb, updated_at = NOW() WHERE id = $1`,
    [categoryId, JSON.stringify(plan)]
  );
}

export async function listDashboardCategories(): Promise<DashboardCategoryRecord[]> {
  const result = await database.query<{
    id: string;
    display_name: string;
    description: string;
    fingerprint: string;
    contract: CategoryContract;
    dashboard_plan: DashboardPagePlan | null;
  }>(
    `SELECT c.id, c.display_name, c.description, sv.fingerprint, sv.contract, c.dashboard_plan
       FROM ${relation('categories')} c
       JOIN ${relation('schema_versions')} sv
         ON sv.category_id = c.id AND sv.version = c.active_schema_version
      WHERE c.status <> 'failed'
      ORDER BY c.created_at`
  );
  return result.rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    description: row.description,
    fingerprint: row.fingerprint,
    contract: row.contract,
    dashboardPlan: row.dashboard_plan ?? undefined,
  }));
}

export async function renameCategory(categoryId: string, displayName: string): Promise<boolean> {
  const result = await database.query(
    `UPDATE ${relation('categories')} SET display_name = $2, dashboard_plan = NULL, updated_at = NOW() WHERE id = $1`,
    [categoryId, displayName.trim()]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function setCategoryCaptureGuide(categoryId: string, captureGuide: CaptureGuide): Promise<boolean> {
  const result = await database.query(
    `UPDATE ${relation('categories')} SET capture_guide = $2, updated_at = NOW() WHERE id = $1`,
    [categoryId, captureGuide]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteCategory(categoryId: string): Promise<boolean> {
  const result = await database.query(`DELETE FROM ${relation('categories')} WHERE id = $1`, [categoryId]);
  return (result.rowCount ?? 0) > 0;
}

export async function setCategoryStatus(categoryId: string, status: Category['status'], error?: string): Promise<void> {
  await database.query(
    `UPDATE ${relation('categories')} SET status = $2, error = $3, updated_at = NOW() WHERE id = $1`,
    [categoryId, status, error ?? null]
  );
}

export async function getSchemaVersion(categoryId: string, version: number): Promise<SchemaVersionRecord | undefined> {
  const result = await database.query<{
    category_id: string;
    version: number;
    fingerprint: string;
    contract: CategoryContract;
    extraction_schema: Record<string, unknown>;
  }>(
    `SELECT category_id, version, fingerprint, contract, extraction_schema
       FROM ${relation('schema_versions')}
      WHERE category_id = $1 AND version = $2`,
    [categoryId, version]
  );
  const row = result.rows[0];
  return row
    ? {
        categoryId: row.category_id,
        version: row.version,
        fingerprint: row.fingerprint,
        contract: row.contract,
        extractionSchema: row.extraction_schema,
      }
    : undefined;
}
