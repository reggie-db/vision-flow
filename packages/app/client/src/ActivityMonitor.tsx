import { Badge, Button, Skeleton } from '@databricks/appkit-ui/react';
import { useEffect, useMemo, useState } from 'react';
import {
  ACTIVITY_IMAGE_PREVIEW_ROUTE,
  ActivityMessageSchema,
  type ActivityMessage,
} from '../../shared/vision-contracts.ts';

type ConnectionState = 'connecting' | 'live' | 'reconnecting';

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
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="activity-preview-error">Preview unavailable.</div>;
  const query = new URLSearchParams({ path });
  return (
    <img
      className="activity-preview-image"
      src={`${ACTIVITY_IMAGE_PREVIEW_ROUTE}?${query}`}
      alt={alt}
      onError={() => setFailed(true)}
    />
  );
}

export function ActivityMonitor() {
  const [events, setEvents] = useState<ActivityMessage[]>([]);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  useEffect(() => {
    const stream = new EventSource('/api/activity/events');
    stream.onopen = () => {
      setConnection('live');
      setError(null);
    };
    stream.addEventListener('activity', (raw) => {
      try {
        const event = ActivityMessageSchema.parse(JSON.parse((raw as MessageEvent<string>).data));
        setEvents((current) => [event, ...current.filter((item) => item.id !== event.id)].slice(0, 100));
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

  return (
    <div className="activity-workspace">
      <div className="activity-toolbar">
        <div className="activity-status" aria-live="polite">
          <span className={`activity-dot ${connection}`} aria-hidden="true" />
          <span>{connection === 'live' ? 'Live' : connection === 'connecting' ? 'Connecting' : 'Reconnecting'}</span>
        </div>
        <div className="activity-counts">
          <Badge variant="secondary">
            {mobileOpens} mobile {mobileOpens === 1 ? 'open' : 'opens'}
          </Badge>
          <Badge variant="secondary">
            {imageEvents} image {imageEvents === 1 ? 'event' : 'events'}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEvents([]);
              setExpandedEventId(null);
            }}
            disabled={events.length === 0}
          >
            Clear view
          </Button>
        </div>
      </div>

      {error ? (
        <div className="operations-error" role="alert">
          {error}
        </div>
      ) : null}

      {connection === 'connecting' && events.length === 0 ? (
        <div className="activity-loading" aria-label="Loading activity">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ) : events.length === 0 ? (
        <div className="operations-empty">
          Activity will appear here when users open the mobile view or submit images.
        </div>
      ) : (
        <ol className="activity-list" aria-label="Recent activity">
          {events.map((event) => {
            const storedPath = stringValue(event.body, 'storedPath');
            const rejectionReason = stringValue(event.body, 'reason');
            const device = deviceSummary(event);
            const expandable = Boolean(storedPath || rejectionReason);
            const expanded = expandedEventId === event.id;
            return (
              <li key={event.id} className={expanded ? 'expanded' : undefined}>
                <span className={`activity-event-icon ${event.type.replaceAll('.', '-')}`} aria-hidden="true" />
                <div className="activity-event-main">
                  <div className="activity-event-heading">
                    <strong>{event.body.summary}</strong>
                    <div className="activity-event-actions">
                      <Badge variant="outline">{eventLabel(event.type)}</Badge>
                      {expandable ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-expanded={expanded}
                          onClick={() => setExpandedEventId(expanded ? null : event.id)}
                        >
                          {storedPath ? 'View image' : 'Details'}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <small>
                    {sender(event)} · {new Date(event.publishedAt).toLocaleString()}
                  </small>
                  {device ? <small className="activity-device-summary">{device}</small> : null}
                </div>
                {expanded ? (
                  <div className="activity-event-details">
                    {storedPath ? (
                      <ActivityImage path={storedPath} alt={`Captured image for ${event.body.summary}`} />
                    ) : null}
                    {rejectionReason ? (
                      <div className="activity-rejection-reason">
                        <span>Reason</span>
                        <p>{rejectionReason}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
