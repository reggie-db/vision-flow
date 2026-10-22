# Dynamic OCR

AppKit scanner and continuous Lakeflow pipeline for reusable, schema-defined image extraction. The default schema recognizes machine-generated sales images with jurisdiction, quantity sold, price, transaction date, and optional address and terminal ID. Users can create or reuse additional schemas, such as driver licenses or signed forms, from the selector.

## Architecture

- **Fast image gate:** the app checks whether an image matches the selected schema and visibly contains required fields before upload.
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
portr http -s local-dynamic-ocr 8000
```

The local tunnel is `https://local-dynamic-ocr.apps.dbx.tools`.

## Workspace setup

The bundle variables in `databricks.yml` are the shared configuration source. Setup stores the shared Lakebase role and generated password in the configured secret scope, migrates the schema registry, creates the Delta results table, creates the federated schema view, removes legacy OCR output tables, seeds the default schema, and updates Genie.

```bash
DATABRICKS_CONFIG_PROFILE=DEFAULT bun packages/app/scripts/setup.ts secret
databricks bundle deploy --profile DEFAULT --target default
DATABRICKS_CONFIG_PROFILE=DEFAULT bun packages/app/scripts/setup.ts finalize
```

## Native camera bridge

The browser camera is used by default. An Android WebView can optionally expose `window.AndroidDocumentCamera` with `startPreview`, `stopPreview`, `focusState`, `refocus`, and `capture` methods.
