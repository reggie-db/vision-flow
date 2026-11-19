import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  PortalContainerProvider,
  ResourceStatusIndicator,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
} from '@databricks/appkit-ui/react';
import { BrandIcon } from '@dbx-tools/ui/branding/react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useDocumentCamera } from './hooks/use-document-camera.ts';
import { OperationsView } from './OperationsView.tsx';
import {
  CaptureGuideSchema,
  CategorySchema,
  OperationEventSchema,
  UploadResponseSchema,
  type Category,
  type CaptureActivityContext,
  type CaptureGuide,
  type DeviceActivityContext,
  type ImageGateResult,
  type OperationEvent,
  type UploadResponse,
} from '../../shared/vision-contracts.ts';

type ScanState = 'scanning' | 'submitting' | 'queued' | 'rejected' | 'error';
type OperationKind = 'create' | 'rename' | 'delete';

interface UserAgentData {
  brands?: Array<{ brand: string; version: string }>;
  mobile?: boolean;
  platform?: string;
}

function displayMode(): DeviceActivityContext['displayMode'] {
  return (
    (['standalone', 'fullscreen', 'minimal-ui'] as const).find(
      (mode) => window.matchMedia(`(display-mode: ${mode})`).matches
    ) ?? 'browser'
  );
}

function browserName(userAgentData: UserAgentData | undefined, userAgent: string): string {
  const brand = userAgentData?.brands?.find((item) => !/not.?a.?brand|chromium/i.test(item.brand))?.brand;
  if (brand) return brand;
  if (/EdgiOS|EdgA|Edg\//i.test(userAgent)) return 'Microsoft Edge';
  if (/CriOS|Chrome\//i.test(userAgent)) return 'Google Chrome';
  if (/FxiOS|Firefox\//i.test(userAgent)) return 'Mozilla Firefox';
  if (/Safari\//i.test(userAgent)) return 'Safari';
  return 'Web browser';
}

function platformName(userAgentData: UserAgentData | undefined, userAgent: string): string {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';
  if (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1) return 'iPadOS';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macOS';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return userAgentData?.platform?.trim() || navigator.platform || 'Unknown platform';
}

function deviceActivityContext(captureSessionId: string): DeviceActivityContext {
  const userAgent = navigator.userAgent;
  const userAgentData = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData;
  return {
    captureSessionId,
    browser: browserName(userAgentData, userAgent),
    platform: platformName(userAgentData, userAgent),
    mobile: userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent),
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    displayMode: displayMode(),
  };
}

function isActualDevice(): boolean {
  const touchFirst = window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
  const mobileBrowser = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const installed = window.matchMedia('(display-mode: standalone)').matches;
  return touchFirst || mobileBrowser || installed;
}

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

async function uploadImage(
  category: Category,
  imageDataUrl: string,
  quickImageDataUrl: string,
  captureContext: CaptureActivityContext
): Promise<UploadResponse> {
  const response = await fetch(`/api/categories/${category.id}/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageDataUrl,
      quickImageDataUrl,
      schemaVersion: category.activeSchemaVersion,
      captureContext,
    }),
  });
  if (!response.ok) throw await responseError(response, 'The image could not be checked and queued.');
  return UploadResponseSchema.parse(await response.json());
}

function readImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
}

function quickPreview(imageDataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 960 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('The image preview could not be created.'));
        return;
      }
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.68));
    };
    image.onerror = () => reject(new Error('The image preview could not be created.'));
    image.src = imageDataUrl;
  });
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/mobile" element={<MobileView />} />
        <Route path="*" element={<OperationsView />} />
      </Routes>
    </BrowserRouter>
  );
}

function MobileView() {
  const actualDevice = isActualDevice();
  const openReported = useRef(false);
  const captureSessionId = useRef(crypto.randomUUID()).current;

  useEffect(() => {
    if (openReported.current) return;
    openReported.current = true;
    void fetch('/api/activity/mobile-open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        ...deviceActivityContext(captureSessionId),
        path: window.location.pathname,
      }),
    }).catch(() => undefined);
  }, [captureSessionId]);

  return (
    <main className={actualDevice ? 'device-stage' : 'desktop-stage'}>
      <section className={actualDevice ? 'device-shell' : 'tablet-shell'}>
        <ScannerExperience captureSessionId={captureSessionId} />
      </section>
    </main>
  );
}

function ScannerExperience({ captureSessionId }: { captureSessionId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newSchemaName, setNewSchemaName] = useState('');
  const [schemaPrompt, setSchemaPrompt] = useState('');
  const [newCaptureGuide, setNewCaptureGuide] = useState<CaptureGuide | 'auto'>('auto');
  const [renameValue, setRenameValue] = useState('');
  const [guideSaving, setGuideSaving] = useState(false);
  const [operationEvents, setOperationEvents] = useState<OperationEvent[]>([]);
  const [operationKind, setOperationKind] = useState<OperationKind | null>(null);
  const [scanState, setScanState] = useState<ScanState>('scanning');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [gate, setGate] = useState<ImageGateResult | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ id: number; x: number; y: number } | null>(null);
  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId) ?? categories[0],
    [categories, selectedCategoryId]
  );
  const captureGuide = selectedCategory?.captureGuide ?? 'vertical';
  const { analysis, cameraError, cameraReady, captureImage, mirrorPreview, nativePreview, refocusAt } =
    useDocumentCamera({ captureGuide, videoRef });

  const loadCategories = async (preferredId?: string) => {
    try {
      const loaded = await fetchCategories();
      setCategories(loaded);
      setCategoriesError(null);
      setSelectedCategoryId((current) => {
        const desired = preferredId ?? current;
        return loaded.some((category) => category.id === desired) ? desired : (loaded[0]?.id ?? '');
      });
    } catch (error) {
      setCategoriesError(error instanceof Error ? error.message : 'Schemas could not be loaded.');
    }
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  useEffect(() => {
    setRenameValue(selectedCategory?.displayName ?? '');
  }, [selectedCategory?.id, selectedCategory?.displayName]);

  const reset = () => {
    setErrorMessage(null);
    setGate(null);
    setScanState('scanning');
  };

  const submitImage = async (imageDataUrl: string, source: CaptureActivityContext['source']) => {
    if (!selectedCategory) return;
    setErrorMessage(null);
    setGate(null);
    setScanState('submitting');
    try {
      const result = await uploadImage(selectedCategory, imageDataUrl, await quickPreview(imageDataUrl), {
        ...deviceActivityContext(captureSessionId),
        source,
      });
      setGate(result.gate);
      setScanState(result.status === 'queued' ? 'queued' : 'rejected');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The image could not be queued.');
      setScanState('error');
    }
  };

  const capture = async () => {
    try {
      await submitImage(await captureImage(), 'camera');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The camera image could not be captured.');
      setScanState('error');
    }
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!file) return;
    try {
      await submitImage(await readImage(file), 'upload');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The image could not be uploaded.');
      setScanState('error');
    }
  };

  const watchOperation = (operationId: string, onReady: (event: OperationEvent) => void) => {
    const stream = new EventSource(`/api/operations/${operationId}/events`);
    stream.addEventListener('progress', (raw) => {
      const event = OperationEventSchema.parse(JSON.parse((raw as MessageEvent<string>).data));
      setOperationEvents((current) => [...current.filter((item) => item.sequence !== event.sequence), event]);
      if (event.stage === 'ready') {
        stream.close();
        setOperationKind(null);
        onReady(event);
      } else if (event.stage === 'failed') {
        stream.close();
        setOperationKind(null);
      }
    });
    stream.onerror = () => {
      stream.close();
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
    try {
      const response = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw await responseError(response, 'The schema could not be updated.');
      const { operationId } = (await response.json()) as { operationId: string };
      watchOperation(operationId, onReady);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The schema could not be updated.';
      setOperationKind(null);
      setOperationEvents([
        {
          sequence: Date.now(),
          stage: 'failed',
          message,
          error: message,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  };

  const createSchema = () => {
    const prompt = schemaPrompt.trim();
    if (prompt.length < 3) return;
    void startOperation(
      'create',
      '/api/categories/resolve',
      'POST',
      {
        ...(newSchemaName.trim() ? { displayName: newSchemaName.trim() } : {}),
        ...(newCaptureGuide === 'auto' ? {} : { captureGuide: newCaptureGuide }),
        prompt,
        idempotencyKey: crypto.randomUUID(),
      },
      (event) => {
        setNewSchemaName('');
        setSchemaPrompt('');
        setNewCaptureGuide('auto');
        setCreateOpen(false);
        void loadCategories(event.categoryId);
      }
    );
  };

  const renameSchema = () => {
    if (!selectedCategory || renameValue.trim().length === 0) return;
    void startOperation(
      'rename',
      `/api/categories/${selectedCategory.id}`,
      'PATCH',
      { displayName: renameValue.trim(), idempotencyKey: crypto.randomUUID() },
      () => void loadCategories(selectedCategory.id)
    );
  };

  const deleteSchema = () => {
    if (!selectedCategory) return;
    setDeleteOpen(false);
    void startOperation(
      'delete',
      `/api/categories/${selectedCategory.id}`,
      'DELETE',
      { idempotencyKey: crypto.randomUUID() },
      () => {
        setSettingsOpen(false);
        void loadCategories();
      }
    );
  };

  const removePrompt = async (categoryId: string, promptId: string) => {
    try {
      const response = await fetch(`/api/categories/${categoryId}/prompts/${promptId}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) {
        throw await responseError(response, 'The prompt could not be removed.');
      }
      await loadCategories(categoryId);
    } catch (error) {
      setCategoriesError(error instanceof Error ? error.message : 'The prompt could not be removed.');
    }
  };

  const updateCaptureGuide = async (value: string) => {
    if (!selectedCategory) return;
    const nextCaptureGuide = CaptureGuideSchema.parse(value);
    setGuideSaving(true);
    try {
      const response = await fetch(`/api/categories/${selectedCategory.id}/capture-guide`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captureGuide: nextCaptureGuide }),
      });
      if (!response.ok) throw await responseError(response, 'The capture guide could not be updated.');
      const payload = (await response.json()) as { category: unknown };
      const updated = CategorySchema.parse(payload.category);
      setCategories((current) => current.map((category) => (category.id === updated.id ? updated : category)));
      setCategoriesError(null);
    } catch (error) {
      setCategoriesError(error instanceof Error ? error.message : 'The capture guide could not be updated.');
    } finally {
      setGuideSaving(false);
    }
  };

  const handleRefocus = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!cameraReady || scanState !== 'scanning') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const rawX = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    const x = mirrorPreview ? 1 - rawX : rawX;
    setFocusPoint({ id: Date.now(), x: rawX, y });
    void refocusAt(x, y);
  };

  const guideState = analysis.focused ? 'focused' : analysis.documentDetected ? 'detected' : 'searching';
  const lastOperation = operationEvents.at(-1);
  const operationBusy = operationKind !== null;
  const missingFieldLabels = (gate?.missingFields ?? []).map((fieldName) => {
    const field = selectedCategory?.contract.fields.find((candidate) => candidate.name === fieldName);
    return field?.label ?? fieldName.replaceAll('_', ' ');
  });

  return (
    <PortalContainerProvider container={portalContainer}>
      <div ref={setPortalContainer} className="scanner">
        <ResourceStatusIndicator position="top-center" />
        <header className="app-bar">
          <BrandIcon className="app-bar-mark" mode="dark" alt="Vision Flow" />
          <Select
            value={selectedCategory?.id ?? ''}
            onValueChange={(value) => {
              setSelectedCategoryId(value);
              reset();
            }}
            disabled={categories.length === 0}
          >
            <SelectTrigger className="schema-select-trigger" aria-label="Current schema">
              <SelectValue placeholder="Choose schema" />
            </SelectTrigger>
            <SelectContent className="schema-select-content">
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {uiCopy(category.displayName)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="settings-button"
            variant="secondary"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            disabled={!selectedCategory}
            aria-label="Schema settings"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3.1 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
            </svg>
          </Button>
        </header>

        {categoriesError ? <div className="inline-error">{categoriesError}</div> : null}

        <div className="camera-view" onPointerDown={handleRefocus}>
          {nativePreview ? (
            <div className="native-preview" aria-hidden="true" />
          ) : (
            <video
              ref={videoRef}
              className={mirrorPreview ? 'mirrored' : undefined}
              autoPlay
              muted
              playsInline
              aria-hidden="true"
            />
          )}

          {scanState === 'submitting' ? (
            <div className="checking-layer" role="status" aria-live="polite">
              <span className="checking-spinner" aria-hidden="true" />
              <strong>Checking image</strong>
            </div>
          ) : scanState === 'scanning' ? (
            <>
              {captureGuide === 'none' ? null : (
                <div
                  className={`focus-box ${captureGuide} ${guideState}`}
                  style={{
                    left: `${analysis.bounds.x * 100}%`,
                    top: `${analysis.bounds.y * 100}%`,
                    width: `${analysis.bounds.width * 100}%`,
                    height: `${analysis.bounds.height * 100}%`,
                  }}
                  aria-hidden="true"
                />
              )}
              {focusPoint ? (
                <span
                  key={focusPoint.id}
                  className="tap-focus"
                  style={{ left: `${focusPoint.x * 100}%`, top: `${focusPoint.y * 100}%` }}
                  aria-hidden="true"
                />
              ) : null}
              <Button
                className="capture-button"
                onClick={() => void capture()}
                disabled={!selectedCategory}
                aria-label={`Capture ${uiCopy(selectedCategory?.displayName ?? 'image')}`}
              >
                <span aria-hidden="true" />
              </Button>
              <Button
                className="upload-button"
                onClick={() => imageInputRef.current?.click()}
                disabled={!selectedCategory}
                aria-label="Upload image"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
                </svg>
              </Button>
              <input
                ref={imageInputRef}
                className="image-upload-input"
                type="file"
                accept="image/*"
                onChange={(event) => void handleImageUpload(event)}
                tabIndex={-1}
                aria-hidden="true"
              />
            </>
          ) : (
            <div className="result-layer">
              <div className={`result-card ${scanState === 'queued' ? 'success' : 'failure'}`}>
                <span className="result-icon" aria-hidden="true">
                  {scanState === 'queued' ? '✓' : '!'}
                </span>
                <h2>
                  {scanState === 'queued'
                    ? 'Queued for extraction'
                    : scanState === 'rejected'
                      ? 'Image failed validation'
                      : 'Could not queue image'}
                </h2>
                <p>
                  {scanState === 'queued'
                    ? 'Extraction will continue in the pipeline.'
                    : gate?.reason || errorMessage || 'Retake the image with the required fields visible.'}
                </p>
                {missingFieldLabels.length ? <p>Missing: {missingFieldLabels.join(', ')}</p> : null}
                <Button className="result-button" onClick={reset}>
                  Scan another
                </Button>
              </div>
            </div>
          )}

          <span className="sr-status" aria-live="polite">
            {cameraError ?? (cameraReady ? 'Camera ready' : 'Starting camera')}
          </span>
        </div>
      </div>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="bottom" className="schema-sheet settings-sheet">
          <SheetHeader>
            <SheetTitle>{uiCopy(selectedCategory?.displayName ?? 'Schema')}</SheetTitle>
            <SheetDescription className="sr-only">Manage the current extraction schema.</SheetDescription>
          </SheetHeader>
          {selectedCategory ? (
            <div className="sheet-scroll">
              <section className="settings-section">
                <div className="rename-row">
                  <Input
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    aria-label="Schema name"
                    disabled={operationBusy}
                  />
                  <Button
                    onClick={renameSchema}
                    disabled={operationBusy || renameValue.trim() === selectedCategory.displayName}
                  >
                    Save
                  </Button>
                </div>
              </section>

              <section className="settings-section">
                <h3>Capture guide</h3>
                <Select
                  value={selectedCategory.captureGuide}
                  onValueChange={(value) => void updateCaptureGuide(value)}
                  disabled={operationBusy || guideSaving}
                >
                  <SelectTrigger className="guide-select-trigger" aria-label="Capture guide">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vertical">Vertical</SelectItem>
                    <SelectItem value="horizontal">Horizontal</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </section>

              <section className="settings-actions" aria-label="Schema actions">
                <Button
                  variant="outline"
                  onClick={() => window.open(selectedCategory.dashboardOpenUrl, '_blank', 'noopener,noreferrer')}
                >
                  Open dashboard
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSettingsOpen(false);
                    setCreateOpen(true);
                  }}
                >
                  New schema
                </Button>
              </section>

              <section className="settings-section">
                <h3>Fields</h3>
                <ul className="field-list">
                  {selectedCategory.contract.fields.map((field) => (
                    <li key={field.name}>
                      <span>{field.label}</span>
                      <small>{field.required ? 'Required' : 'Optional'}</small>
                    </li>
                  ))}
                </ul>
              </section>

              {selectedCategory.prompts.length > 0 ? (
                <section className="settings-section">
                  <h3>Prompts</h3>
                  <ul className="prompt-list">
                    {selectedCategory.prompts.map((prompt) => (
                      <li key={prompt.id}>
                        <span>{uiCopy(prompt.prompt)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void removePrompt(selectedCategory.id, prompt.id)}
                        >
                          Delete
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {lastOperation && operationKind !== 'create' ? (
                <div className={`operation-status ${lastOperation.stage}`} role="status" aria-live="polite">
                  <span aria-hidden="true" />
                  <p>{uiCopy(lastOperation.message)}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          <SheetFooter className="danger-footer">
            <Button
              className="destructive-action"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              disabled={operationBusy || categories.length <= 1}
            >
              Delete schema
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="bottom" className="schema-sheet create-sheet">
          <SheetHeader>
            <SheetTitle>New schema</SheetTitle>
            <SheetDescription className="sr-only">Create a reusable extraction schema.</SheetDescription>
          </SheetHeader>
          <div className="create-form">
            <Input
              value={newSchemaName}
              onChange={(event) => setNewSchemaName(event.target.value)}
              placeholder="Name"
              aria-label="Schema name"
              disabled={operationBusy}
            />
            <Textarea
              value={schemaPrompt}
              onChange={(event) => setSchemaPrompt(event.target.value)}
              placeholder="Driver license with name, license number, state, birth date, and expiration date"
              aria-label="Fields to recognize"
              disabled={operationBusy}
              rows={5}
            />
            <label className="create-field">
              <span>Capture guide</span>
              <Select
                value={newCaptureGuide}
                onValueChange={(value) =>
                  setNewCaptureGuide(value === 'auto' ? 'auto' : CaptureGuideSchema.parse(value))
                }
              >
                <SelectTrigger aria-label="Capture guide">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automatic</SelectItem>
                  <SelectItem value="vertical">Vertical</SelectItem>
                  <SelectItem value="horizontal">Horizontal</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {lastOperation && operationKind === 'create' ? (
              <div className={`operation-status ${lastOperation.stage}`} role="status" aria-live="polite">
                <span aria-hidden="true" />
                <p>{uiCopy(lastOperation.message)}</p>
              </div>
            ) : null}
          </div>
          <SheetFooter>
            <Button onClick={createSchema} disabled={operationBusy || schemaPrompt.trim().length < 3}>
              {operationKind === 'create' ? 'Creating…' : 'Create'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {uiCopy(selectedCategory?.displayName ?? 'schema')}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes its prompts and dashboard page. Existing extraction results remain available.
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
    </PortalContainerProvider>
  );
}
