import { z } from 'zod';
import { config } from './config.ts';
import { databricksJson } from './databricks-api.ts';

const DashboardListItemSchema = z.object({
  dashboard_id: z.string(),
  display_name: z.string(),
  lifecycle_state: z.string().optional(),
});

const DashboardListSchema = z.union([
  z.array(DashboardListItemSchema),
  z.object({ dashboards: z.array(DashboardListItemSchema).default([]) }),
]);

export interface DashboardLinks {
  dashboardOpenUrl: string;
  dashboardEmbedUrl: string;
}

let resolvedDashboardId = config.dashboardId;
let dashboardIdRequest: Promise<string> | undefined;

async function lookupDashboardId(): Promise<string> {
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
  resolvedDashboardId = match.dashboard_id;
  return resolvedDashboardId;
}

export async function resolveDashboardId(): Promise<string> {
  if (resolvedDashboardId) return resolvedDashboardId;
  dashboardIdRequest ??= lookupDashboardId();
  try {
    return await dashboardIdRequest;
  } finally {
    dashboardIdRequest = undefined;
  }
}

export function dashboardLinks(dashboardId: string): DashboardLinks {
  const workspaceQuery = config.workspaceId ? `?o=${encodeURIComponent(config.workspaceId)}` : '';
  const encodedDashboardId = encodeURIComponent(dashboardId);
  return {
    dashboardOpenUrl: `${config.workspaceHost}/sql/dashboardsv3/${encodedDashboardId}/published${workspaceQuery}`,
    dashboardEmbedUrl: `${config.workspaceHost}/embed/dashboardsv3/${encodedDashboardId}${workspaceQuery}`,
  };
}

export async function resolveDashboardLinks(): Promise<DashboardLinks> {
  return dashboardLinks(await resolveDashboardId());
}
