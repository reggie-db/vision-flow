# Vision Flow

AppKit scanner and continuous Lakeflow pipeline for reusable, schema-defined image extraction. Vision Flow generates vision-model prompts from versioned JSON schemas so one ingestion flow can produce structured data from different image categories. The initial registry includes machine sales, lottery receipts, ID verification, store-layout audits, and room chair counts. Users can create or reuse additional schemas from the selector.

## Architecture

- **Fast image gate:** the app quickly checks whether an image matches the selected document type before upload; field extraction remains in the strong-model pipeline.
- **Strong extraction model:** the continuous Spark pipeline uses the configured strong vision model for schema-constrained parsing.
- **Schema registry:** Lakebase stores categories, immutable JSON schemas, PostgreSQL full-text search vectors, and pgvector embeddings.
- **Shared database role:** the app and Spark workers connect through one password role stored in a Databricks secret. Worker processes cache one PostgreSQL pool and immutable schema lookups.
- **Result storage:** every extraction is merged into one Delta table with a pseudo-primary scan ID, schema fingerprint, searchable text, and nested `VARIANT` payload.
- **Genie context:** a secret-backed Unity Catalog PostgreSQL connection exposes the active Lakebase schema registry through a governed view.
- **Long operations:** category creation and Genie updates stream progress to the browser with server-sent events.

## Local development

```bash
bun run compile
DATABRICKS_CONFIG_PROFILE=DEFAULT bun packages/app/scripts/local-start.ts
portr http -s local-vision-flow 8000
```

The local tunnel is `https://local-vision-flow.apps.dbx.tools`.

## Workspace setup

The bundle variables in `databricks.yml` are the shared configuration source. Setup stores the shared Lakebase role and generated password in the configured secret scope, migrates the schema registry, creates the Delta results table, creates the federated schema view, removes legacy output tables, seeds the demo schemas, and updates Genie.

```bash
DATABRICKS_CONFIG_PROFILE=DEFAULT bun packages/app/scripts/setup.ts secret
databricks bundle deploy --profile DEFAULT --target default
DATABRICKS_CONFIG_PROFILE=DEFAULT bun packages/app/scripts/setup.ts finalize
```

## Native camera bridge

The browser camera is used by default. An Android WebView can optionally expose `window.AndroidDocumentCamera` with `startPreview`, `stopPreview`, `focusState`, `refocus`, and `capture` methods.
