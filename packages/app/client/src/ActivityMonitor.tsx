import { Badge, Button, Skeleton } from '@databricks/appkit-ui/react';
import { useEffect, useMemo, useState } from 'react';
import { ActivityMessageSchema, type ActivityMessage } from '../../shared/vision-contracts.ts';

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
          <Button variant="outline" size="sm" onClick={() => setEvents([])} disabled={events.length === 0}>
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
          {events.map((event) => (
            <li key={event.id}>
              <span className={`activity-event-icon ${event.type.replaceAll('.', '-')}`} aria-hidden="true" />
              <div className="activity-event-main">
                <div>
                  <strong>{event.body.summary}</strong>
                  <Badge variant="outline">{eventLabel(event.type)}</Badge>
                </div>
                <small>
                  {sender(event)} · {new Date(event.publishedAt).toLocaleString()}
                </small>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
