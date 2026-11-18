import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
} from '@databricks/appkit-ui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CaptureGuideSchema,
  CategorySchema,
  OperationEventSchema,
  type CaptureGuide,
  type Category,
  type OperationEvent,
} from '../../shared/vision-contracts.ts';

type OperationKind = 'create' | 'rename' | 'delete';

function uiCopy(value: string): string {
  return value.replace(/\bdocuments\b/gi, 'images').replace(/\bdocument\b/gi, 'image');
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return new Error(payload?.error ?? fallback);
}

async function fetchCategories(): Promise<Category[]> {
  const response = await fetch('/api/categories');
  if (!response.ok) throw await responseError(response, 'Schemas could not be loaded.');
  const payload = (await response.json()) as { categories: unknown };
  return CategorySchema.array().parse(payload.categories);
}

export function SchemaManagement() {
  const streams = useRef(new Set<EventSource>());
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newCaptureGuide, setNewCaptureGuide] = useState<CaptureGuide | 'auto'>('auto');
  const [renameValue, setRenameValue] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [operationKind, setOperationKind] = useState<OperationKind | null>(null);
  const [operationEvents, setOperationEvents] = useState<OperationEvent[]>([]);
  const [guideSaving, setGuideSaving] = useState(false);

  const selected = useMemo(
    () => categories.find((category) => category.id === selectedId) ?? categories[0],
    [categories, selectedId]
  );

  const loadCategories = useCallback(async (preferredId?: string) => {
    try {
      const loaded = await fetchCategories();
      setCategories(loaded);
      setSelectedId((current) => {
        const desired = preferredId ?? current;
        return loaded.some((category) => category.id === desired) ? desired : (loaded[0]?.id ?? '');
      });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Schemas could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
    return () => {
      for (const stream of streams.current) stream.close();
      streams.current.clear();
    };
  }, [loadCategories]);

  useEffect(() => {
    setRenameValue(selected?.displayName ?? '');
  }, [selected?.displayName, selected?.id]);

  const watchOperation = (operationId: string, onReady: (event: OperationEvent) => void) => {
    const stream = new EventSource(`/api/operations/${operationId}/events`);
    streams.current.add(stream);
    const close = () => {
      stream.close();
      streams.current.delete(stream);
    };
    stream.addEventListener('progress', (raw) => {
      const event = OperationEventSchema.parse(JSON.parse((raw as MessageEvent<string>).data));
      setOperationEvents((current) => [...current.filter((item) => item.sequence !== event.sequence), event]);
      if (event.stage === 'ready') {
        close();
        setOperationKind(null);
        onReady(event);
      } else if (event.stage === 'failed') {
        close();
        setOperationKind(null);
      }
    });
    stream.onerror = () => {
      close();
      setOperationKind(null);
      setOperationEvents((current) => [
        ...current,
        {
          sequence: Date.now(),
          stage: 'failed',
          message: 'The progress stream disconnected. Try again.',
          error: 'Progress stream disconnected.',
          createdAt: new Date().toISOString(),
        },
      ]);
    };
  };

  const startOperation = async (
    kind: OperationKind,
    path: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body: Record<string, unknown>,
    onReady: (event: OperationEvent) => void
  ) => {
    setOperationKind(kind);
    setOperationEvents([]);
    setError(null);
    try {
      const response = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw await responseError(response, 'The schema could not be updated.');
      const { operationId } = (await response.json()) as { operationId: string };
      watchOperation(operationId, onReady);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The schema could not be updated.';
      setError(message);
      setOperationKind(null);
    }
  };

  const createSchema = () => {
    const prompt = newPrompt.trim();
    if (prompt.length < 3) return;
    void startOperation(
      'create',
      '/api/categories/resolve',
      'POST',
      {
        ...(newName.trim() ? { displayName: newName.trim() } : {}),
        ...(newCaptureGuide === 'auto' ? {} : { captureGuide: newCaptureGuide }),
        prompt,
        idempotencyKey: crypto.randomUUID(),
      },
      (event) => {
        setNewName('');
        setNewPrompt('');
        setNewCaptureGuide('auto');
        void loadCategories(event.categoryId);
      }
    );
  };

  const renameSchema = () => {
    if (!selected || !renameValue.trim()) return;
    void startOperation(
      'rename',
      `/api/categories/${selected.id}`,
      'PATCH',
      { displayName: renameValue.trim(), idempotencyKey: crypto.randomUUID() },
      () => void loadCategories(selected.id)
    );
  };

  const deleteSchema = () => {
    if (!selected) return;
    setDeleteOpen(false);
    void startOperation(
      'delete',
      `/api/categories/${selected.id}`,
      'DELETE',
      { idempotencyKey: crypto.randomUUID() },
      () => void loadCategories()
    );
  };

  const updateCaptureGuide = async (value: string) => {
    if (!selected) return;
    const captureGuide = CaptureGuideSchema.parse(value);
    setGuideSaving(true);
    try {
      const response = await fetch(`/api/categories/${selected.id}/capture-guide`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captureGuide }),
      });
      if (!response.ok) throw await responseError(response, 'The capture guide could not be updated.');
      const payload = (await response.json()) as { category: unknown };
      const updated = CategorySchema.parse(payload.category);
      setCategories((current) => current.map((category) => (category.id === updated.id ? updated : category)));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The capture guide could not be updated.');
    } finally {
      setGuideSaving(false);
    }
  };

  const removePrompt = async (promptId: string) => {
    if (!selected) return;
    try {
      const response = await fetch(`/api/categories/${selected.id}/prompts/${promptId}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404)
        throw await responseError(response, 'The prompt could not be removed.');
      await loadCategories(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The prompt could not be removed.');
    }
  };

  const lastOperation = operationEvents.at(-1);
  const busy = operationKind !== null;

  if (loading) {
    return (
      <div className="schema-loading" aria-label="Loading schemas">
        <Skeleton className="schema-list-skeleton" />
        <Skeleton className="schema-detail-skeleton" />
      </div>
    );
  }

  return (
    <div className="schema-workspace">
      <aside className="schema-sidebar" aria-label="Schemas">
        <div className="schema-sidebar-header">
          <strong>Schemas</strong>
          <Badge variant="secondary">{categories.length}</Badge>
        </div>
        <div className="schema-nav">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={category.id === selected?.id ? 'schema-nav-item active' : 'schema-nav-item'}
              onClick={() => setSelectedId(category.id)}
            >
              <span>{uiCopy(category.displayName)}</span>
              <small>{category.contract.fields.length} fields</small>
            </button>
          ))}
        </div>
      </aside>

      <div className="schema-main">
        {error ? (
          <div className="operations-error" role="alert">
            {error}
          </div>
        ) : null}

        <section className="schema-create-panel" aria-labelledby="create-schema-title">
          <div>
            <h2 id="create-schema-title">New schema</h2>
            <p>Describe the image and the structured fields the model should return.</p>
          </div>
          <div className="schema-create-grid">
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Name (optional)"
              aria-label="New schema name"
              disabled={busy}
            />
            <Select
              value={newCaptureGuide}
              onValueChange={(value) => setNewCaptureGuide(value === 'auto' ? 'auto' : CaptureGuideSchema.parse(value))}
              disabled={busy}
            >
              <SelectTrigger aria-label="New schema capture guide">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automatic guide</SelectItem>
                <SelectItem value="vertical">Vertical guide</SelectItem>
                <SelectItem value="horizontal">Horizontal guide</SelectItem>
                <SelectItem value="none">No guide</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              value={newPrompt}
              onChange={(event) => setNewPrompt(event.target.value)}
              placeholder="Driver license with name, license number, state, birth date, and expiration date"
              aria-label="Fields to extract"
              disabled={busy}
              rows={3}
            />
            <Button onClick={createSchema} disabled={busy || newPrompt.trim().length < 3}>
              {operationKind === 'create' ? 'Creating…' : 'Create schema'}
            </Button>
          </div>
          {lastOperation && operationKind === 'create' ? (
            <div className={`operation-status ${lastOperation.stage}`} role="status" aria-live="polite">
              <span aria-hidden="true" />
              <p>{uiCopy(lastOperation.message)}</p>
            </div>
          ) : null}
        </section>

        {selected ? (
          <section className="schema-detail" aria-labelledby="selected-schema-title">
            <div className="schema-detail-header">
              <div>
                <h2 id="selected-schema-title">{uiCopy(selected.displayName)}</h2>
                <p>{uiCopy(selected.description)}</p>
              </div>
              <div className="schema-detail-actions">
                <Button
                  variant="outline"
                  onClick={() => window.open(selected.dashboardUrl, '_blank', 'noopener,noreferrer')}
                >
                  Open dashboard
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteOpen(true)}
                  disabled={busy || categories.length <= 1}
                >
                  Delete
                </Button>
              </div>
            </div>

            <div className="schema-settings-row">
              <label>
                <span>Name</span>
                <div className="schema-inline-control">
                  <Input
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    aria-label="Schema name"
                    disabled={busy}
                  />
                  <Button
                    onClick={renameSchema}
                    disabled={busy || !renameValue.trim() || renameValue.trim() === selected.displayName}
                  >
                    Save
                  </Button>
                </div>
              </label>
              <label>
                <span>Capture guide</span>
                <Select
                  value={selected.captureGuide}
                  onValueChange={(value) => void updateCaptureGuide(value)}
                  disabled={busy || guideSaving}
                >
                  <SelectTrigger aria-label="Capture guide">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vertical">Vertical</SelectItem>
                    <SelectItem value="horizontal">Horizontal</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>

            <div className="schema-detail-columns">
              <div>
                <h3>Fields</h3>
                <ul className="desktop-field-list">
                  {selected.contract.fields.map((field) => (
                    <li key={field.name}>
                      <div>
                        <strong>{field.label}</strong>
                        <span>{field.description}</span>
                      </div>
                      <Badge variant={field.required ? 'default' : 'outline'}>
                        {field.required ? 'Required' : 'Optional'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Prompts</h3>
                {selected.prompts.length ? (
                  <ul className="desktop-prompt-list">
                    {selected.prompts.map((prompt) => (
                      <li key={prompt.id}>
                        <span>{uiCopy(prompt.prompt)}</span>
                        <Button variant="ghost" size="sm" onClick={() => void removePrompt(prompt.id)}>
                          Delete
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="operations-empty">No saved prompts.</p>
                )}
              </div>
            </div>

            {lastOperation && operationKind !== 'create' ? (
              <div className={`operation-status ${lastOperation.stage}`} role="status" aria-live="polite">
                <span aria-hidden="true" />
                <p>{uiCopy(lastOperation.message)}</p>
              </div>
            ) : null}
          </section>
        ) : (
          <div className="operations-empty">No schemas are available.</div>
        )}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {uiCopy(selected?.displayName ?? 'schema')}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its prompts and dashboard page will be removed. Existing structured results remain available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="delete-confirm-button" onClick={deleteSchema}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
