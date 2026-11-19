import { Button } from '@databricks/appkit-ui/react';
import { DataTable, type ColumnDef } from '@dbx-tools/ui/table/react';
import { useEffect, useMemo, useState } from 'react';
import {
  ACTIVITY_EVENT_LIMIT,
  ACTIVITY_IMAGE_PREVIEW_ROUTE,
  ActivityMessageSchema,
  type ActivityMessage,
} from '../../shared/vision-contracts.ts';

type ConnectionState = 'connecting' | 'live' | 'reconnecting';
type PreviewState = 'loading' | 'loaded' | 'failed';

function eventLabel(type: string): string {
  return type
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' · ');
}

function sender(event: ActivityMessage): string {
  const value = event.metadata.senderEmail ?? event.metadata.senderName ?? event.metadata.senderId;
  return typeof value === 'string' ? value : 'Application';
}

function stringValue(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function deviceSummary(event: ActivityMessage): string | undefined {
  const browser = stringValue(event.metadata, 'browser');
  const platform = stringValue(event.metadata, 'platform');
  const source = stringValue(event.metadata, 'captureSource');
  const width = numberValue(event.metadata, 'viewportWidth');
  const height = numberValue(event.metadata, 'viewportHeight');
  const pixelRatio = numberValue(event.metadata, 'devicePixelRatio');
  const ip = stringValue(event.metadata, 'clientIp');
  const parts = [browser, platform];
  if (source) parts.push(source === 'camera' ? 'Camera' : 'Uploaded image');
  if (width && height) parts.push(`${width}×${height}${pixelRatio ? ` @${pixelRatio}x` : ''}`);
  if (ip) parts.push(ip);
  return parts.filter(Boolean).join(' · ') || undefined;
}

function ActivityImage({ path, alt }: { path: string; alt: string }) {
  const [state, setState] = useState<PreviewState>('loading');
  const query = new URLSearchParams({ path });
  return (
    <div className={`activity-preview-frame ${state}`}>
      {state === 'loading' ? (
        <span className="activity-preview-spinner" role="status" aria-label="Loading image preview" />
      ) : null}
      {state === 'failed' ? <span className="activity-preview-error">Preview unavailable.</span> : null}
      <img
        className="activity-preview-image"
        src={`${ACTIVITY_IMAGE_PREVIEW_ROUTE}?${query}`}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setState('loaded')}
        onError={() => setState('failed')}
      />
    </div>
  );
}

export function ActivityMonitor() {
  const [events, setEvents] = useState<ActivityMessage[]>([]);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stream = new EventSource('/api/activity/events');
    stream.onopen = () => {
      setConnection('live');
      setError(null);
    };
    stream.addEventListener('activity', (raw) => {
      try {
        const event = ActivityMessageSchema.parse(JSON.parse((raw as MessageEvent<string>).data));
        setEvents((current) =>
          [event, ...current.filter((item) => item.id !== event.id)].slice(0, ACTIVITY_EVENT_LIMIT)
        );
      } catch {
        setError('An activity event could not be read.');
      }
    });
    stream.addEventListener('activity-error', (raw) => {
      const payload = JSON.parse((raw as MessageEvent<string>).data) as { error?: string };
      setError(payload.error ?? 'Activity history could not be loaded.');
    });
    stream.onerror = () => {
      setConnection('reconnecting');
      setError('The live stream disconnected. Reconnecting…');
    };
    return () => stream.close();
  }, []);

  const mobileOpens = useMemo(() => events.filter((event) => event.type === 'mobile.view.opened').length, [events]);
  const imageEvents = useMemo(() => events.filter((event) => event.type.startsWith('image.')).length, [events]);
  const columns = useMemo<ColumnDef<ActivityMessage>[]>(
    () => [
      {
        id: 'activity',
        header: 'Activity',
        accessorFn: (event) => event.body.summary,
        size: 370,
        cell: ({ row }) => {
          const event = row.original;
          const rejectionReason = stringValue(event.body, 'reason');
          return (
            <div className="activity-table-event">
              <span className={`activity-event-icon ${event.type.replaceAll('.', '-')}`} aria-hidden="true" />
              <div>
                <strong>{event.body.summary}</strong>
                <span className="activity-event-type">{eventLabel(event.type)}</span>
                {rejectionReason ? <small>{rejectionReason}</small> : null}
              </div>
            </div>
          );
        },
      },
      {
        id: 'preview',
        header: 'Captured image',
        size: 310,
        enableSorting: false,
        cell: ({ row }) => {
          const event = row.original;
          const storedPath = stringValue(event.body, 'storedPath');
          return storedPath ? (
            <ActivityImage path={storedPath} alt={`Captured image for ${event.body.summary}`} />
          ) : (
            <span className="activity-table-empty" aria-label="No captured image">
              —
            </span>
          );
        },
      },
      {
        id: 'device',
        header: 'Capture device',
        accessorFn: (event) => deviceSummary(event) ?? '',
        size: 320,
        cell: ({ row }) => (
          <span className="activity-device-summary">{deviceSummary(row.original) ?? 'Not reported'}</span>
        ),
      },
      {
        accessorKey: 'publishedAt',
        header: 'Time',
        size: 210,
        cell: ({ row }) => (
          <div className="activity-table-time">
            <span>{new Date(row.original.publishedAt).toLocaleString()}</span>
            <small>{sender(row.original)}</small>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <div className="activity-workspace">
      {error ? (
        <div className="operations-error" role="alert">
          {error}
        </div>
      ) : null}
      <DataTable
        id="vision-flow-activity"
        className="activity-table"
        data={events}
        columns={columns}
        getRowId={(event) => event.id}
        ariaLabel="Recent activity"
        persistence={false}
        initialState={{ sorting: [{ id: 'publishedAt', desc: true }] }}
        summary={
          <span className="activity-status">
            <span className={`activity-dot ${connection}`} aria-hidden="true" />
            {connection === 'live' ? 'Live' : connection === 'connecting' ? 'Connecting' : 'Reconnecting'}
          </span>
        }
        description={`${events.length} events · ${mobileOpens} mobile opens · ${imageEvents} image events`}
        toolbarActions={
          <Button variant="outline" size="sm" onClick={() => setEvents([])} disabled={events.length === 0}>
            Clear view
          </Button>
        }
        empty="Activity will appear here when users open the mobile view or submit images."
        loading={connection === 'connecting' && events.length === 0}
        loadingContent="Loading activity."
        showColumnMenu={false}
        showReset={false}
        enableColumnReordering={false}
        enableColumnResizing={false}
        lazy
        initialRowCount={10}
        rowBatchSize={10}
        resetScrollOnStateChange={false}
      />
    </div>
  );
}
