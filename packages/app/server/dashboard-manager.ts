import { createHash } from 'node:crypto';
import { withAdvisoryLock } from '@dbx-tools/postgres';
import { z } from 'zod';
import { config } from './config.ts';
import { database } from './database.ts';
import { DatabricksApiError, databricksJson } from './databricks-api.ts';
import { DashboardPagePlanSchema, generateDashboardPagePlan, type DashboardPagePlan } from './model-gateway.ts';
import { listDashboardCategories, setCategoryDashboardPlan, type DashboardCategoryRecord } from './registry.ts';
import { executeWarehouseSql } from './sql-warehouse.ts';
import type { CategoryContract, ScalarField } from '../shared/vision-contracts.ts';

const DashboardSchema = z.object({
  dashboard_id: z.string(),
  serialized_dashboard: z.string(),
  etag: z.string().optional(),
});

const DashboardListItemSchema = z.object({
  dashboard_id: z.string(),
  display_name: z.string(),
  lifecycle_state: z.string().optional(),
});

const DashboardListSchema = z.union([
  z.array(DashboardListItemSchema),
  z.object({ dashboards: z.array(DashboardListItemSchema).default([]) }),
]);

type JsonRecord = Record<string, unknown>;

function stableName(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 12)}`;
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function scalarFields(contract: CategoryContract): ScalarField[] {
  return contract.fields.filter((field): field is ScalarField => field.type !== 'array');
}

function fallbackPlan(category: DashboardCategoryRecord): DashboardPagePlan {
  const fields = scalarFields(category.contract);
  return {
    title: category.displayName,
    subtitle: category.description,
    metricField:
      fields.find((field) => field.type === 'currency' || field.type === 'number' || field.type === 'integer')?.name ??
      null,
    groupingField: fields.find((field) => field.type === 'string' || field.type === 'boolean')?.name ?? null,
    dateField: fields.find((field) => field.type === 'date')?.name ?? null,
    detailFields: fields.slice(0, 8).map((field) => field.name),
  };
}

function normalizePlan(category: DashboardCategoryRecord, proposed: DashboardPagePlan): DashboardPagePlan {
  const fields = scalarFields(category.contract);
  const byName = new Map(fields.map((field) => [field.name, field]));
  const metric = proposed.metricField ? byName.get(proposed.metricField) : undefined;
  const grouping = proposed.groupingField ? byName.get(proposed.groupingField) : undefined;
  const date = proposed.dateField ? byName.get(proposed.dateField) : undefined;
  const detailFields = proposed.detailFields
    .filter((name, index, values) => byName.has(name) && values.indexOf(name) === index)
    .slice(0, 8);
  const fallback = fallbackPlan(category);
  return {
    title: proposed.title.trim() || fallback.title,
    subtitle: proposed.subtitle.trim() || fallback.subtitle,
    metricField: metric && ['integer', 'number', 'currency'].includes(metric.type) ? metric.name : fallback.metricField,
    groupingField: grouping && ['string', 'boolean'].includes(grouping.type) ? grouping.name : fallback.groupingField,
    dateField: date?.type === 'date' ? date.name : fallback.dateField,
    detailFields: detailFields.length > 0 ? detailFields : fallback.detailFields,
  };
}

function castExpression(field: ScalarField): string {
  const path = `payload:fields.${field.name}.value`;
  const type =
    field.type === 'integer'
      ? 'BIGINT'
      : field.type === 'number' || field.type === 'currency'
        ? 'DOUBLE'
        : field.type === 'boolean'
          ? 'BOOLEAN'
          : field.type === 'date'
            ? 'DATE'
            : 'STRING';
  return `TRY_CAST(${path} AS ${type}) AS \`${field.name}\``;
}

function datasetQuery(category: DashboardCategoryRecord): string {
  const fieldSql = scalarFields(category.contract).map((field) => `  ${castExpression(field)}`);
  return [
    'SELECT',
    '  document_id,',
    '  processed_at,',
    '  needs_review,',
    '  CASE WHEN needs_review THEN 1 ELSE 0 END AS review_flag,',
    '  document_type_match,',
    '  CASE WHEN document_type_match THEN 1.0 ELSE 0.0 END AS match_score,',
    '  generic_description,',
    '  full_text' + (fieldSql.length > 0 ? ',' : ''),
    fieldSql.join(',\n'),
    `FROM ${config.documentsTable}`,
    `WHERE schema_id = ${sqlLiteral(category.fingerprint)}`,
    "  AND processing_status = 'completed'",
    'ORDER BY processed_at DESC',
  ]
    .filter(Boolean)
    .join('\n');
}

function textWidget(name: string, text: string, y: number): JsonRecord {
  return {
    widget: { name, multilineTextboxSpec: { lines: [text] } },
    position: { x: 0, y, width: 12, height: 1 },
  };
}

function counterWidget(
  name: string,
  title: string,
  datasetName: string,
  fieldName: string,
  expression: string,
  x: number,
  format?: JsonRecord
): JsonRecord {
  return {
    widget: {
      name,
      queries: [
        {
          name: 'main_query',
          query: {
            datasetName,
            fields: [{ name: fieldName, expression }],
            disaggregated: false,
          },
        },
      ],
      spec: {
        version: 2,
        widgetType: 'counter',
        encodings: {
          value: {
            fieldName,
            displayName: title,
            ...(format ? { format } : {}),
          },
        },
        frame: { showTitle: true, title },
      },
    },
    position: { x, y: 2, width: 4, height: 3 },
  };
}

function lineWidget(datasetName: string, y: number): JsonRecord {
  return {
    widget: {
      name: 'scan_trend',
      queries: [
        {
          name: 'main_query',
          query: {
            datasetName,
            fields: [
              { name: 'day(processed_at)', expression: 'DATE_TRUNC("DAY", `processed_at`)' },
              { name: 'count(document_id)', expression: 'COUNT(`document_id`)' },
            ],
            disaggregated: false,
          },
        },
      ],
      spec: {
        version: 3,
        widgetType: 'line',
        encodings: {
          x: { fieldName: 'day(processed_at)', displayName: 'Day', scale: { type: 'temporal' } },
          y: {
            scale: { type: 'quantitative' },
            fields: [{ fieldName: 'count(document_id)', displayName: 'Scans' }],
          },
        },
        frame: { showTitle: true, title: 'Scans over time' },
      },
    },
    position: { x: 0, y, width: 6, height: 6 },
  };
}

function reviewWidget(datasetName: string, y: number): JsonRecord {
  return {
    widget: {
      name: 'review_status',
      queries: [
        {
          name: 'main_query',
          query: {
            datasetName,
            fields: [
              { name: 'needs_review', expression: '`needs_review`' },
              { name: 'count(document_id)', expression: 'COUNT(`document_id`)' },
            ],
            disaggregated: false,
          },
        },
      ],
      spec: {
        version: 3,
        widgetType: 'bar',
        encodings: {
          x: { fieldName: 'needs_review', displayName: 'Needs review', scale: { type: 'categorical' } },
          y: {
            scale: { type: 'quantitative' },
            fields: [{ fieldName: 'count(document_id)', displayName: 'Scans' }],
          },
        },
        frame: { showTitle: true, title: 'Review status' },
      },
    },
    position: { x: 6, y, width: 6, height: 6 },
  };
}

function fieldFormat(field: ScalarField): JsonRecord | undefined {
  if (field.type === 'currency') return { type: 'number-currency', currencyCode: 'USD', abbreviation: 'compact' };
  if (field.type === 'number') return { type: 'number', decimalPlaces: { type: 'max', places: 2 } };
  return undefined;
}

function metricWidget(
  category: DashboardCategoryRecord,
  datasetName: string,
  plan: DashboardPagePlan,
  y: number
): JsonRecord | undefined {
  if (!plan.metricField) return undefined;
  const field = scalarFields(category.contract).find((candidate) => candidate.name === plan.metricField);
  if (!field) return undefined;
  const valueName = `avg(${field.name})`;
  return {
    widget: {
      name: 'schema_metric_trend',
      queries: [
        {
          name: 'main_query',
          query: {
            datasetName,
            fields: [
              { name: 'day(processed_at)', expression: 'DATE_TRUNC("DAY", `processed_at`)' },
              { name: valueName, expression: `AVG(\`${field.name}\`)` },
            ],
            disaggregated: false,
          },
        },
      ],
      spec: {
        version: 3,
        widgetType: 'line',
        encodings: {
          x: { fieldName: 'day(processed_at)', displayName: 'Day', scale: { type: 'temporal' } },
          y: {
            scale: { type: 'quantitative' },
            fields: [
              {
                fieldName: valueName,
                displayName: field.label,
                ...(fieldFormat(field) ? { format: fieldFormat(field) } : {}),
              },
            ],
          },
        },
        frame: { showTitle: true, title: `${field.label} over time` },
      },
    },
    position: { x: 0, y, width: 12, height: 6 },
  };
}

function tableWidget(
  category: DashboardCategoryRecord,
  datasetName: string,
  plan: DashboardPagePlan,
  y: number
): JsonRecord {
  const byName = new Map(scalarFields(category.contract).map((field) => [field.name, field]));
  const selected = plan.detailFields
    .map((name) => byName.get(name))
    .filter((field): field is ScalarField => Boolean(field));
  const fields = [
    { name: 'processed_at', expression: '`processed_at`', label: 'Processed' },
    { name: 'generic_description', expression: '`generic_description`', label: 'Description' },
    { name: 'needs_review', expression: '`needs_review`', label: 'Needs review' },
    ...selected.map((field) => ({ name: field.name, expression: `\`${field.name}\``, label: field.label, field })),
  ];
  return {
    widget: {
      name: 'latest_scans',
      queries: [
        {
          name: 'main_query',
          query: {
            datasetName,
            fields: fields.map((field) => ({ name: field.name, expression: field.expression })),
            disaggregated: true,
          },
        },
      ],
      spec: {
        version: 2,
        widgetType: 'table',
        encodings: {
          columns: fields.map((field) => ({
            fieldName: field.name,
            displayName: field.label,
            ...('field' in field && field.field && fieldFormat(field.field)
              ? { format: fieldFormat(field.field) }
              : {}),
          })),
        },
        frame: { showTitle: true, title: 'Latest scans' },
      },
    },
    position: { x: 0, y, width: 12, height: 7 },
  };
}

function page(
  category: DashboardCategoryRecord,
  plan: DashboardPagePlan
): { dataset: JsonRecord; page: JsonRecord; sql: string } {
  const datasetName = stableName('schema', category.fingerprint);
  const sql = datasetQuery(category);
  const metric = metricWidget(category, datasetName, plan, 11);
  const tableY = metric ? 17 : 11;
  return {
    dataset: {
      name: datasetName,
      displayName: `${category.displayName} scans`,
      queryLines: sql.split('\n').map((line) => `${line}\n`),
      catalog: config.genieCatalog,
      schema: config.genieSchema,
    },
    page: {
      name: stableName('page', category.fingerprint),
      displayName: category.displayName,
      pageType: 'PAGE_TYPE_CANVAS',
      layoutVersion: 'GRID_V1',
      layout: [
        textWidget('title', `## ${plan.title}`, 0),
        textWidget('subtitle', plan.subtitle, 1),
        counterWidget('total_scans', 'Total scans', datasetName, 'count(document_id)', 'COUNT(`document_id`)', 0),
        counterWidget('needs_review', 'Needs review', datasetName, 'sum(review_flag)', 'SUM(`review_flag`)', 4),
        counterWidget('match_rate', 'Schema match rate', datasetName, 'avg(match_score)', 'AVG(`match_score`)', 8, {
          type: 'number-percent',
          decimalPlaces: { type: 'exact', places: 1 },
        }),
        lineWidget(datasetName, 5),
        reviewWidget(datasetName, 5),
        ...(metric ? [metric] : []),
        tableWidget(category, datasetName, plan, tableY),
      ],
    },
    sql,
  };
}

function serializedDashboard(categories: DashboardCategoryRecord[]): { serialized: string; queries: string[] } {
  const built = categories.map((category) => page(category, category.dashboardPlan ?? fallbackPlan(category)));
  const dashboard = {
    datasets: built.map((item) => item.dataset),
    pages: built.map((item) => item.page),
    uiSettings: {
      theme: {
        canvasBackgroundColor: { light: '#F7F8FA', dark: '#1F272D' },
        widgetBackgroundColor: { light: '#FFFFFF', dark: '#11171C' },
        fontColor: { light: '#11171C', dark: '#E8ECF0' },
        selectionColor: { light: '#2272B4', dark: '#8ACAFF' },
        visualizationColors: ['#2272B4', '#00A972', '#FFAB00', '#D946EF', '#EF4444', '#64748B'],
        widgetHeaderAlignment: 'LEFT',
      },
    },
  };
  return { serialized: `${JSON.stringify(dashboard, null, 2)}\n`, queries: built.map((item) => item.sql) };
}

async function resolveDashboardId(): Promise<string> {
  if (config.dashboardId) return config.dashboardId;
  const payload = DashboardListSchema.parse(
    await databricksJson('/api/2.0/lakeview/dashboards?page_size=100', {
      signal: AbortSignal.timeout(20_000),
    })
  );
  const dashboards = Array.isArray(payload) ? payload : payload.dashboards;
  const match = dashboards.find(
    (dashboard) => dashboard.display_name === config.dashboardDisplayName && dashboard.lifecycle_state !== 'TRASHED'
  );
  if (!match) throw new Error(`Dashboard ${config.dashboardDisplayName} was not provisioned by the bundle.`);
  return match.dashboard_id;
}

async function updateDashboard(dashboardId: string, serialized: string, includeEtag = true): Promise<void> {
  const current = DashboardSchema.parse(
    await databricksJson(`/api/2.0/lakeview/dashboards/${encodeURIComponent(dashboardId)}`, {
      signal: AbortSignal.timeout(20_000),
    })
  );
  await databricksJson(`/api/2.0/lakeview/dashboards/${encodeURIComponent(dashboardId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      display_name: config.dashboardDisplayName,
      warehouse_id: config.genieWarehouseId,
      serialized_dashboard: serialized,
      ...(includeEtag && current.etag ? { etag: current.etag } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  await databricksJson(`/api/2.0/lakeview/dashboards/${encodeURIComponent(dashboardId)}/published`, {
    method: 'POST',
    body: JSON.stringify({ warehouse_id: config.genieWarehouseId, embed_credentials: false }),
    signal: AbortSignal.timeout(30_000),
  });
}

export async function refreshVisionDashboard(): Promise<string> {
  return withAdvisoryLock(database, ['vision-flow', 'dashboard', config.dashboardDisplayName], async () => {
    const categories = await listDashboardCategories();
    const { serialized, queries } = serializedDashboard(categories);
    for (const query of queries) await executeWarehouseSql(query);
    const dashboardId = await resolveDashboardId();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        await updateDashboard(dashboardId, serialized);
        return dashboardId;
      } catch (error) {
        if (!(error instanceof DatabricksApiError) || error.status !== 409) throw error;
      }
    }
    await updateDashboard(dashboardId, serialized, false);
    return dashboardId;
  });
}

export async function ensureCategoryDashboard(categoryId: string): Promise<string> {
  const categories = await listDashboardCategories();
  const category = categories.find((candidate) => candidate.id === categoryId);
  if (!category) throw new Error(`Schema ${categoryId} is unavailable for dashboard generation.`);
  if (!category.dashboardPlan) {
    let plan: DashboardPagePlan;
    try {
      plan = normalizePlan(
        category,
        DashboardPagePlanSchema.parse(
          await generateDashboardPagePlan(category.displayName, category.description, category.contract)
        )
      );
    } catch {
      plan = fallbackPlan(category);
    }
    await setCategoryDashboardPlan(category.id, plan);
  }
  return refreshVisionDashboard();
}
