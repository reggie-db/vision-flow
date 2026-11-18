import { config } from './config.ts';
import { executeUcStatements } from './sql-warehouse.ts';

function identifier(value: string): string {
  return `\`${value.replaceAll('`', '``')}\``;
}

function stringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function relation(name: string): string {
  return [config.genieCatalog, config.genieSchema, name].map(identifier).join('.');
}

export const documentsRelation = relation(config.documentsTable);
export const schemaRegistryRelation = relation(config.schemaRegistryView);

export function visionStorageStatements(): string[] {
  const remoteSchemaSql = [
    'SELECT c.id::text AS category_id, c.display_name, c.slug, c.description, c.status, c.active_schema_version,',
    'sv.fingerprint, sv.contract::text AS contract_json, sv.extraction_schema::text AS extraction_schema_json, sv.search_text',
    `FROM ${config.metaSchema}.categories c`,
    `JOIN ${config.metaSchema}.schema_versions sv ON sv.category_id = c.id AND sv.version = c.active_schema_version`,
    'WHERE c.status = ',
  ].join(' ');
  const remoteQuery = `concat(${stringLiteral(remoteSchemaSql)}, char(39), 'ready', char(39))`;
  const volume = config.volumeFullName.split('.').map(identifier).join('.');

  return [
    `CREATE VOLUME IF NOT EXISTS ${volume} COMMENT 'Source images awaiting schema-constrained vision extraction.'`,
    `DROP VIEW IF EXISTS ${schemaRegistryRelation}`,
    `DROP CONNECTION IF EXISTS ${identifier(config.lakebaseConnection)}`,
    `CREATE CONNECTION ${identifier(config.lakebaseConnection)} TYPE POSTGRESQL OPTIONS (` +
      `host ${stringLiteral(config.pgHost)}, port ${stringLiteral(String(config.pgPort))}, ` +
      `user secret(${stringLiteral(config.lakebaseSecretScope)}, ${stringLiteral(config.lakebaseUserKey)}), ` +
      `password secret(${stringLiteral(config.lakebaseSecretScope)}, ${stringLiteral(config.lakebasePasswordKey)}))`,
    `CREATE TABLE IF NOT EXISTS ${documentsRelation} (
      document_id STRING NOT NULL COMMENT 'Pseudo-primary identifier derived from the immutable uploaded image name.',
      schema_id STRING COMMENT 'SHA-256 fingerprint of the immutable extraction schema.',
      category_id STRING COMMENT 'Lakebase category UUID associated with the schema.',
      schema_version INT COMMENT 'Immutable schema version used for extraction.',
      schema_slug STRING COMMENT 'Stable schema category identifier.',
      source_path STRING COMMENT 'Unity Catalog Volume path of the source image.',
      processing_status STRING COMMENT 'completed or failed processing outcome.',
      document_type_match BOOLEAN COMMENT 'True when the strong extraction model confirms the image matches the selected schema.',
      needs_review BOOLEAN COMMENT 'True when the image mismatches the schema, required data is missing, confidence is low, or processing failed.',
      generic_description STRING COMMENT 'Domain-neutral description of visible image content for broad search.',
      full_text STRING COMMENT 'Visible text transcribed in reading order.',
      search_text STRING COMMENT 'Searchable concatenation of generic description, visible text, extracted values, and evidence.',
      payload VARIANT COMMENT 'Nested schema-constrained extraction. Field envelopes are under payload:fields and contain value, confidence, and evidence.',
      warnings ARRAY<STRING> COMMENT 'Model and validation warnings associated with the extraction.',
      error STRING COMMENT 'Processing error when processing_status is failed.',
      model_service STRING COMMENT 'Strong model service used for schema-constrained extraction.',
      processed_at TIMESTAMP COMMENT 'UTC timestamp when processing completed.'
    ) USING DELTA
    COMMENT 'One row per image extraction. Join schema_id to the extraction schema registry fingerprint and query nested values from payload.'
    CLUSTER BY AUTO
    TBLPROPERTIES ('quality' = 'silver', 'delta.enableRowTracking' = 'true')`,
    `CREATE OR REPLACE VIEW ${schemaRegistryRelation}
    COMMENT 'Active extraction schemas read from Lakebase through a secret-backed Unity Catalog PostgreSQL connection.'
    AS SELECT
      category_id,
      display_name,
      slug,
      description,
      status,
      active_schema_version,
      fingerprint,
      parse_json(contract_json) AS contract,
      parse_json(extraction_schema_json) AS extraction_schema,
      search_text
    FROM remote_query(
      ${stringLiteral(config.lakebaseConnection)},
      database => ${stringLiteral(config.lakebaseDatabase)},
      query => ${remoteQuery}
    )`,
    `COMMENT ON COLUMN ${schemaRegistryRelation}.category_id IS 'Lakebase category UUID.'`,
    `COMMENT ON COLUMN ${schemaRegistryRelation}.display_name IS 'Human-readable schema name shown in the scanner and dashboard.'`,
    `COMMENT ON COLUMN ${schemaRegistryRelation}.slug IS 'Stable schema category identifier used in uploaded paths and image extractions.'`,
    `COMMENT ON COLUMN ${schemaRegistryRelation}.description IS 'Human-readable purpose of the extraction schema.'`,
    `COMMENT ON COLUMN ${schemaRegistryRelation}.active_schema_version IS 'Current immutable schema version.'`,
    `COMMENT ON COLUMN ${schemaRegistryRelation}.fingerprint IS 'SHA-256 schema identifier; join to the extraction results schema_id.'`,
    `COMMENT ON COLUMN ${schemaRegistryRelation}.contract IS 'VARIANT contract containing schema intent, extraction instructions, and field definitions.'`,
    `COMMENT ON COLUMN ${schemaRegistryRelation}.extraction_schema IS 'VARIANT JSON Schema used by the strong extraction model.'`,
    `COMMENT ON COLUMN ${schemaRegistryRelation}.search_text IS 'Schema descriptions and field hints used for discovery and context.'`,
    `GRANT SELECT ON TABLE ${documentsRelation} TO \`account users\``,
    `GRANT SELECT ON VIEW ${schemaRegistryRelation} TO \`account users\``,
  ];
}

export async function ensureVisionStorage(): Promise<void> {
  await executeUcStatements(visionStorageStatements());
}
