# Vision Flow

Vision Flow ingests images as structured data by combining reusable schemas with dynamically generated prompts for vision models. A user defines the fields and validation rules for a document or scene, then Vision Flow builds a schema-specific extraction prompt, processes submitted images, and stores the typed results for review and analysis.

The same ingestion flow can support different visual inputs without maintaining a separate parser for each format. Schemas are versioned so extraction results remain tied to the instructions and data contract used to create them.

## Use cases

- **Lottery receipt scanning:** extract jurisdiction, game, draw date, ticket quantities, prices, retailer details, and transaction metadata from receipt or terminal images.
- **Store layout auditing:** compare shelf, display, signage, and product placement images against a required layout and record structured compliance findings.
- **ID verification:** extract identity fields from supported documents, check required fields and document characteristics, and route low-confidence results for review.
- **Forms and operational documents:** define schemas for signed forms, inspection records, labels, invoices, or other image-based inputs that need typed downstream data.

## How it works

1. Define or select a JSON schema for the image category.
2. Validate that an uploaded image matches the selected category and contains the required fields.
3. Generate extraction instructions from the schema and submit the image to a vision model.
4. Store the structured result with its schema fingerprint, confidence, searchable text, and source image metadata.
5. Review results and analyze the typed data through Databricks SQL, AI/BI dashboards, or Genie.

Vision Flow uses a Databricks App for capture and schema management, Lakebase for the schema registry and processing metadata, a continuous Lakeflow pipeline for extraction, and Delta tables for results.

## App surfaces

- `/` is the operations workspace for the embedded AI/BI dashboard, schema management, live activity, and the React Flow system map. The dbx-tools assistant bubble opens Mastra and Genie chats in a right-side panel.
- `/mobile` is the camera-first capture interface. Opening it and submitting images emits persisted activity through the dbx-tools Postgres topic bus so the operations workspace can replay recent events and follow new ones in real time.

## Local development

Install dependencies and compile the workspace:

```bash
bun install
bun run compile
```

Start the app with an explicit Databricks profile:

```bash
DATABRICKS_CONFIG_PROFILE=<profile> bun packages/app/scripts/local-start.ts
portr http -s local-vision-flow 8000
```

The local tunnel is `https://local-vision-flow.apps.dbx.tools`.

See [packages/app/README.md](packages/app/README.md) for workspace setup and deployment details.
