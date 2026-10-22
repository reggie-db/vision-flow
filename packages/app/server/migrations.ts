import { quotePostgresIdentifier, withAdvisoryLock, withAdvisoryTransactionLock } from '@dbx-tools/postgres';
import type { Pool } from 'pg';
import { config } from './config.ts';

const migrationLock = ['dynamic-ocr', 'schema-registry-migrations'];

async function ensureVector(pool: Pool): Promise<void> {
  await withAdvisoryLock(pool, [...migrationLock, 'vector-extension'], async (client) => {
    const installed = await client.query<{ installed: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed",
    );
    if (installed.rows[0]?.installed) return;
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== '42501') throw error;
      const retry = await client.query<{ installed: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed",
      );
      if (!retry.rows[0]?.installed) throw error;
    }
  });
}

export async function migrateRegistry(pool: Pool): Promise<void> {
  await ensureVector(pool);
  const meta = quotePostgresIdentifier(config.metaSchema);
  await withAdvisoryTransactionLock(pool, migrationLock, async (client) => {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${meta}`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${meta}.categories (
        id UUID PRIMARY KEY,
        display_name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        active_schema_version INTEGER NOT NULL DEFAULT 1,
        table_name TEXT NOT NULL,
        uc_table TEXT NOT NULL,
        volume_directory TEXT NOT NULL,
        dashboard_plan JSONB,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`ALTER TABLE ${meta}.categories ADD COLUMN IF NOT EXISTS display_name TEXT`);
    await client.query(
      `UPDATE ${meta}.categories SET display_name = INITCAP(REPLACE(slug, '_', ' ')) WHERE display_name IS NULL OR BTRIM(display_name) = ''`,
    );
    await client.query(`ALTER TABLE ${meta}.categories ALTER COLUMN display_name SET NOT NULL`);
    await client.query(`ALTER TABLE ${meta}.categories ADD COLUMN IF NOT EXISTS dashboard_plan JSONB`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${meta}.schema_versions (
        category_id UUID NOT NULL REFERENCES ${meta}.categories(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        fingerprint TEXT NOT NULL,
        contract JSONB NOT NULL,
        extraction_schema JSONB NOT NULL,
        search_text TEXT NOT NULL,
        search_document TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', search_text)) STORED,
        embedding VECTOR(1024),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (category_id, version),
        UNIQUE (fingerprint)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${meta}.category_prompts (
        id UUID PRIMARY KEY,
        category_id UUID NOT NULL REFERENCES ${meta}.categories(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        normalized_prompt TEXT NOT NULL UNIQUE,
        search_document TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', prompt)) STORED,
        canonical BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(
      `ALTER TABLE ${meta}.schema_versions ADD COLUMN IF NOT EXISTS search_document TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', search_text)) STORED`,
    );
    await client.query(
      `ALTER TABLE ${meta}.category_prompts ADD COLUMN IF NOT EXISTS search_document TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', prompt)) STORED`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS schema_versions_embedding_hnsw ON ${meta}.schema_versions USING hnsw (embedding vector_cosine_ops)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS schema_versions_search_gin ON ${meta}.schema_versions USING gin (search_document)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS category_prompts_search_gin ON ${meta}.category_prompts USING gin (search_document)`,
    );
    await client.query(`COMMENT ON TABLE ${meta}.categories IS 'Registry of reusable OCR image schemas.'`);
    await client.query(`COMMENT ON COLUMN ${meta}.categories.display_name IS 'Human-readable schema name shown in the scanner and dashboard.'`);
    await client.query(`COMMENT ON COLUMN ${meta}.categories.dashboard_plan IS 'LLM-generated analytics page plan used to build the shared OCR dashboard.'`);
    await client.query(
      `COMMENT ON TABLE ${meta}.schema_versions IS 'Immutable OCR extraction contracts and embeddings used for schema matching.'`,
    );
    await client.query(`COMMENT ON TABLE ${meta}.category_prompts IS 'User prompts associated with reusable OCR schemas.'`);
    await client.query(`COMMENT ON COLUMN ${meta}.schema_versions.search_text IS 'Human-readable schema summary used for PostgreSQL full-text search.'`);
    await client.query(`COMMENT ON COLUMN ${meta}.schema_versions.search_document IS 'Generated English tsvector used as the primary schema discovery index.'`);
    await client.query(`COMMENT ON COLUMN ${meta}.schema_versions.embedding IS 'Optional pgvector embedding used as a semantic fallback when full-text search finds no schema.'`);
    await client.query(`COMMENT ON COLUMN ${meta}.category_prompts.search_document IS 'Generated English tsvector for matching prior user schema requests.'`);
  });
}

export async function resetSchemaRegistry(pool: Pool): Promise<void> {
  const meta = quotePostgresIdentifier(config.metaSchema);
  await withAdvisoryTransactionLock(pool, [...migrationLock, 'reset'], async (client) => {
    await client.query(`TRUNCATE TABLE ${meta}.category_prompts, ${meta}.schema_versions, ${meta}.categories CASCADE`);
  });
}
