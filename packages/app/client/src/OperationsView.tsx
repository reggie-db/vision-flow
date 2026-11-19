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
import { ActivityMonitor } from './ActivityMonitor.tsx';
import { InfoPresentation } from './InfoPresentation.tsx';
import { SchemaManagement } from './SchemaManagement.tsx';
import { CategorySchema, type Category } from '../../shared/vision-contracts.ts';

async function responseError(response: Response, fallback: string): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return new Error(payload?.error ?? fallback);
}

function DashboardWorkspace() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [frameReady, setFrameReady] = useState(false);
  const [frameError, setFrameError] = useState(false);
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

  const dashboard = categories[0];

  if (loading) return <Skeleton className="dashboard-skeleton" aria-label="Loading dashboard" />;
  if (error) return <div className="operations-error">{error}</div>;
  if (!dashboard) return <div className="operations-empty">No dashboard is configured.</div>;

  return (
    <div className="dashboard-workspace">
      <div className="dashboard-toolbar">
        <span>
          {frameError ? 'Dashboard embed unavailable' : frameReady ? 'Published AI/BI dashboard' : 'Loading dashboard…'}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(dashboard.dashboardOpenUrl, '_blank', 'noopener,noreferrer')}
        >
          Open in AI/BI
        </Button>
      </div>
      <div className="dashboard-frame-wrap">
        {!frameReady && !frameError ? <Skeleton className="dashboard-frame-loading" /> : null}
        {frameError ? (
          <div className="dashboard-frame-error operations-error" role="alert">
            The dashboard could not be embedded. Open it in AI/BI instead.
          </div>
        ) : null}
        <iframe
          className="dashboard-frame"
          src={dashboard.dashboardEmbedUrl}
          title="Vision Flow AI/BI dashboard"
          onLoad={() => setFrameReady(true)}
          onError={() => setFrameError(true)}
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
      mode="dock"
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
        <Tabs defaultValue="dashboard" className="operations-tabs">
          <header className="operations-header">
            <div className="operations-brand">
              <BrandIcon className="operations-mark" alt="Vision Flow" />
              <div>
                <strong>Vision Flow</strong>
                <span>Operations</span>
              </div>
            </div>
            <TabsList aria-label="Operations views">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="schemas">Schemas</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="info">Info</TabsTrigger>
            </TabsList>
            <Button
              className="operations-mobile-button"
              size="icon"
              onClick={() => window.location.assign('/mobile')}
              aria-label="Open mobile capture"
              title="Open mobile capture"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 5.5 10.2 4h3.6L15 5.5h3A2.5 2.5 0 0 1 20.5 8v8A2.5 2.5 0 0 1 18 18.5H6A2.5 2.5 0 0 1 3.5 16V8A2.5 2.5 0 0 1 6 5.5h3Z" />
                <circle cx="12" cy="12" r="3.25" />
              </svg>
            </Button>
          </header>
          <TabsContent value="dashboard" className="operations-tab-panel">
            <DashboardWorkspace />
          </TabsContent>
          <TabsContent value="schemas" className="operations-tab-panel">
            <SchemaManagement />
          </TabsContent>
          <TabsContent value="activity" className="operations-tab-panel">
            <ActivityMonitor />
          </TabsContent>
          <TabsContent value="info" className="operations-tab-panel">
            <InfoPresentation />
          </TabsContent>
        </Tabs>
      </main>
    </MastraAssistant>
  );
}
