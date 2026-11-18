import {
  Button,
  ResourceStatusIndicator,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@databricks/appkit-ui/react';
import { BrandIcon } from '@dbx-tools/ui/branding/react';
import { MastraAssistant } from '@dbx-tools/ui-mastra/react';
import { useEffect, useState } from 'react';
import { CategorySchema, type Category } from '../../shared/vision-contracts.ts';
import { ActivityMonitor } from './ActivityMonitor.tsx';
import { SchemaManagement } from './SchemaManagement.tsx';
import { SystemFlow } from './SystemFlow.tsx';

async function responseError(response: Response, fallback: string): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return new Error(payload?.error ?? fallback);
}

function DashboardWorkspace() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/categories')
      .then(async (response) => {
        if (!response.ok) throw await responseError(response, 'The dashboard could not be loaded.');
        const payload = (await response.json()) as { categories: unknown };
        setCategories(CategorySchema.array().parse(payload.categories));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'The dashboard could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const dashboardUrl = categories[0]?.dashboardUrl;

  if (loading) return <Skeleton className="dashboard-skeleton" aria-label="Loading dashboard" />;
  if (error) return <div className="operations-error">{error}</div>;
  if (!dashboardUrl) return <div className="operations-empty">No dashboard is configured.</div>;

  return (
    <div className="dashboard-workspace">
      <div className="dashboard-toolbar">
        <span>{loaded ? 'Dashboard loaded' : 'Loading dashboard…'}</span>
        <Button variant="outline" size="sm" onClick={() => window.open(dashboardUrl, '_blank', 'noopener,noreferrer')}>
          Open in AI/BI
        </Button>
      </div>
      <div className="dashboard-frame-wrap">
        {!loaded ? <Skeleton className="dashboard-frame-loading" /> : null}
        <iframe
          className="dashboard-frame"
          src={dashboardUrl}
          title="Vision Flow AI/BI dashboard"
          onLoad={() => setLoaded(true)}
          allow="clipboard-write"
        />
      </div>
    </div>
  );
}

export function OperationsView() {
  return (
    <MastraAssistant
      className="operations-assistant-shell"
      contentClassName="operations-assistant-content"
      panelClassName="operations-assistant-panel"
      mode="overlay"
      side="right"
      resizable={{ defaultSize: 500, minSize: 380, storageKey: 'vision-flow-assistant-size' }}
      mobileBreakpoint={720}
      title="Vision Flow data assistant"
      launcher={{ position: 'bottom-right', label: 'Open Vision Flow assistant' }}
      chat={{
        agentId: 'vision_data',
        enableThreads: true,
        threadPlacement: 'top',
        enableExport: true,
        showModelPicker: false,
        suggestions: [
          'How many images have been processed?',
          'Which images need review?',
          'Which schemas are available and what fields do they extract?',
        ],
      }}
    >
      <main className="operations-shell">
        <div className="operations-resource-indicator">
          <ResourceStatusIndicator position="top-center" />
        </div>
        <header className="operations-header">
          <div className="operations-brand">
            <BrandIcon className="operations-mark" alt="Vision Flow" />
            <div>
              <strong>Vision Flow</strong>
              <span>Operations</span>
            </div>
          </div>
          <Button onClick={() => window.location.assign('/mobile')}>Open mobile capture</Button>
        </header>

        <Tabs defaultValue="dashboard" className="operations-tabs">
          <TabsList aria-label="Operations views">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="schemas">Schemas</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="flow">Flow</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard" className="operations-tab-panel">
            <DashboardWorkspace />
          </TabsContent>
          <TabsContent value="schemas" className="operations-tab-panel">
            <SchemaManagement />
          </TabsContent>
          <TabsContent value="activity" className="operations-tab-panel">
            <ActivityMonitor />
          </TabsContent>
          <TabsContent value="flow" className="operations-tab-panel">
            <SystemFlow />
          </TabsContent>
        </Tabs>
      </main>
    </MastraAssistant>
  );
}
