import { project, projectJs } from "@dbx-tools/projen";
import { readFileSync } from "node:fs";
import { YamlFile } from "projen";

interface BundleVariable {
  readonly default?: unknown;
  readonly value?: unknown;
}

interface BundleConfiguration {
  readonly variables?: Record<string, BundleVariable>;
}

const appBundle = Bun.YAML.parse(
  readFileSync(new URL("./packages/app/databricks.yml", import.meta.url), "utf8"),
) as BundleConfiguration;

function bundleVariable(name: string): string {
  const variable = appBundle.variables?.[name];
  const value = variable?.value ?? variable?.default;
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`Bundle variable ${name} must define a value or default.`);
  }
  return String(value);
}

const documentsVolumeFullName = [
  bundleVariable("catalog"),
  bundleVariable("schema"),
  bundleVariable("documents_volume_name"),
].join(".");

const rootProject = new projectJs.DBXToolsNodeProject({
  name: "vision-flow",
  scope: "vision-flow",
  packageRoots: ["packages"],
  packageDefaults: { publishable: false },
  appkit: true,
  appRoot: "packages/app",
  appBundle: false,
  releaseMode: "disabled",
});

rootProject.pnpmWorkspace.addCatalog("tw-animate-css", "1.4.0");

project.applyToProjects(rootProject, { path: "packages/app" }, (app) => {
  app.tryRemoveFile("app.yaml");
  new YamlFile(app, "app.yaml", {
    readonly: true,
    obj: {
      command: ["./node_modules/.bin/bun", "server/server.ts"],
      env: [
        { name: "VISION_FLOW_MODEL_SERVICE", valueFrom: "quick-model" },
        { name: "VISION_FLOW_DASHBOARD_MODEL_SERVICE", valueFrom: "dashboard-model" },
        { name: "VISION_FLOW_EMBEDDING_ENDPOINT", valueFrom: "embedding-endpoint" },
        { name: "VISION_FLOW_VOLUME_FULL_NAME", value: documentsVolumeFullName },
        { name: "VISION_FLOW_LAKEBASE_PROJECT", value: `projects/${bundleVariable("lakebase_project_id")}` },
        {
          name: "VISION_FLOW_LAKEBASE_BRANCH",
          value: `projects/${bundleVariable("lakebase_project_id")}/branches/${bundleVariable("lakebase_branch_id")}`,
        },
        {
          name: "VISION_FLOW_LAKEBASE_ENDPOINT",
          value: `projects/${bundleVariable("lakebase_project_id")}/branches/${bundleVariable("lakebase_branch_id")}/endpoints/${bundleVariable("lakebase_endpoint_id")}`,
        },
        { name: "VISION_FLOW_LAKEBASE_DATABASE", value: bundleVariable("lakebase_database_name") },
        { name: "VISION_FLOW_LAKEBASE_ROLE", value: bundleVariable("lakebase_role_name") },
        { name: "VISION_FLOW_LAKEBASE_SECRET_SCOPE", value: bundleVariable("lakebase_secret_scope") },
        { name: "VISION_FLOW_LAKEBASE_USER_KEY", value: bundleVariable("lakebase_user_key") },
        { name: "VISION_FLOW_LAKEBASE_PASSWORD_KEY", value: bundleVariable("lakebase_password_key") },
        { name: "VISION_FLOW_LAKEBASE_CONNECTION", value: bundleVariable("lakebase_connection") },
        { name: "VISION_FLOW_GENIE_CATALOG", value: bundleVariable("genie_catalog") },
        { name: "VISION_FLOW_GENIE_SCHEMA", value: bundleVariable("genie_schema") },
        { name: "VISION_FLOW_META_SCHEMA", value: bundleVariable("meta_schema") },
        { name: "VISION_FLOW_DOCUMENTS_TABLE", value: bundleVariable("documents_table") },
        { name: "VISION_FLOW_SCHEMA_REGISTRY_VIEW", value: bundleVariable("schema_registry_view") },
        { name: "VISION_FLOW_GENIE_SPACE_ID", valueFrom: "genie-space" },
        { name: "VISION_FLOW_GENIE_WAREHOUSE_ID", valueFrom: "sql-warehouse" },
        { name: "VISION_FLOW_GENIE_MAX_TABLES", value: bundleVariable("genie_max_tables") },
        { name: "VISION_FLOW_DASHBOARD_DISPLAY_NAME", value: bundleVariable("dashboard_display_name") },
        { name: "VISION_FLOW_WORKSPACE_HOST", value: bundleVariable("workspace_host") },
        { name: "MASTRA_GENIE_IDENTITY", value: bundleVariable("mastra_genie_identity") },
        { name: "VISION_FLOW_REVIEW_THRESHOLD", value: bundleVariable("review_threshold") },
        { name: "VISION_FLOW_PG_USER", value: bundleVariable("lakebase_role_name") },
        { name: "PGROLE", value: bundleVariable("lakebase_role_name") },
        { name: "DBX_TOOLS_POSTGRES_ROLE", value: bundleVariable("lakebase_role_name") },
        { name: "VISION_FLOW_PG_PASSWORD", valueFrom: "lakebase-password" },
        { name: "DATABRICKS_VOLUME_FILES", valueFrom: "documents-volume" },
        { name: "LAKEBASE_ENDPOINT", valueFrom: "postgres" },
      ],
    },
  });
  app.gitignore.addPatterns("__pycache__/", "*.py[cod]");
  app.addDeps(
    "@databricks/appkit@0.81.0",
    "@databricks/appkit-ui@0.81.0",
    "@databricks/sdk-experimental@^0.17.0",
    "@tailwindcss/vite@^4.3.2",
    "@vitejs/plugin-react@^5.1.1",
    "@dbx-tools/appkit@^0.9.210",
    "@dbx-tools/appkit-mastra@^0.9.210",
    "@dbx-tools/auth@^0.9.210",
    "@dbx-tools/core@^0.9.210",
    "@dbx-tools/email@^0.9.210",
    "@dbx-tools/lakebase@^0.9.210",
    "@dbx-tools/postgres@^0.9.210",
    "@dbx-tools/shared-core@^0.9.210",
    "@dbx-tools/shared-mastra@^0.9.210",
    "@dbx-tools/tunnel@^0.9.210",
    "@dbx-tools/ui@^0.9.210",
    "@dbx-tools/ui-mastra@^0.9.210",
    "@fontsource-variable/dm-sans@^5.3.0",
    "@fontsource/dm-mono@^5.3.0",
    "@mlflow/core@0.4.0",
    "pg@^8.22.0",
    "react@~19.2.4",
    "react-dom@~19.2.4",
    "react-router-dom@^7.6.2",
    "tailwindcss@^4.3.2",
    "tw-animate-css@1.4.0",
    "zod@4.3.6",
  );
  app.addDevDeps(
    "@tailwindcss/vite@^4.3.2",
    "@types/node@^24.6.0",
    "@types/pg@^8",
    "@types/react@^19.2.2",
    "@types/react-dom@^19.2.2",
    "@vitejs/plugin-react@^5.1.1",
    "bun-plugin-tailwind@^0.1.2",
    "vite@npm:rolldown-vite@7.1.14",
  );
  app.tasks.tryFind("dev")?.reset("bun --watch scripts/local-start.ts", { receiveArgs: true });
});

const rootDev = rootProject.addTask("dev", {
  description: "Run the AppKit server in development mode",
  env: { NODE_ENV: "development" },
  exec: "bun --watch scripts/local-start.ts",
  receiveArgs: true,
});
rootDev.cwd = "packages/app";

rootProject.gitignore.addPatterns(
  "/.databricks/",
  "/.kanna/",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
);
rootProject.synth();
