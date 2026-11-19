import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { CaptureGuide } from '../../../shared/vision-contracts.ts';
import {
  analyzeFocus,
  captureGuideBounds,
  initialFocusAnalysis,
  type FocusAnalysis,
  type FocusBounds,
} from '../lib/focus.ts';

interface AndroidFocusState {
  bounds?: FocusBounds;
  focused: boolean;
  score?: number;
}

interface AndroidDocumentCameraBridge {
  capture(): Promise<{ imageDataUrl: string }>;
  focusState(): Promise<AndroidFocusState>;
  refocus?(point: { x: number; y: number }): Promise<void>;
  startPreview(options?: { facingMode: 'environment' }): Promise<void>;
  stopPreview(): Promise<void>;
}

declare global {
  interface Window {
    AndroidDocumentCamera?: AndroidDocumentCameraBridge;
  }
}

interface UseDocumentCameraOptions {
  captureGuide: CaptureGuide;
  videoRef: RefObject<HTMLVideoElement | null>;
}

interface DocumentCameraState {
  analysis: FocusAnalysis;
  cameraError: string | null;
  cameraReady: boolean;
  captureImage(): Promise<string>;
  mirrorPreview: boolean;
  nativePreview: boolean;
  refocusAt(x: number, y: number): Promise<boolean>;
}

interface FrameCrop {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface CameraCapabilities {
  focusMode?: string[];
}

interface CameraFocusConstraint {
  focusMode?: string;
  pointsOfInterest?: Array<{ x: number; y: number }>;
}

/** Crop the raw camera frame to the aspect ratio visible through the camera viewport. */
function visibleFrameCrop(video: HTMLVideoElement, targetAspect: number): FrameCrop {
  const sourceAspect = video.videoWidth / video.videoHeight;
  if (sourceAspect > targetAspect) {
    const width = video.videoHeight * targetAspect;
    return {
      height: video.videoHeight,
      width,
      x: (video.videoWidth - width) / 2,
      y: 0,
    };
  }

  const height = video.videoWidth / targetAspect;
  return {
    height,
    width: video.videoWidth,
    x: 0,
    y: (video.videoHeight - height) / 2,
  };
}

/** Draw the same center-cropped frame that the user sees in the camera viewport. */
function drawVisibleFrame(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number
): void {
  const crop = visibleFrameCrop(video, width / height);
  context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
}

/** Use Android autofocus metadata when available and canvas analysis everywhere else. */
export function useDocumentCamera({ captureGuide, videoRef }: UseDocumentCameraOptions): DocumentCameraState {
  const [analysis, setAnalysis] = useState(() => initialFocusAnalysis(captureGuide));
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [mirrorPreview, setMirrorPreview] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const nativePreview = Boolean(window.AndroidDocumentCamera);

  useEffect(() => {
    setAnalysis(initialFocusAnalysis(captureGuide));
  }, [captureGuide]);

  useEffect(() => {
    if (nativePreview) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is not available in this browser.');
      setCameraReady(false);
      return;
    }

    setCameraError(null);
    setCameraReady(false);
    setMirrorPreview(false);
    let cancelled = false;
    void navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          height: { ideal: 1080 },
          width: { ideal: 1920 },
        },
      })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setMirrorPreview(stream.getVideoTracks()[0]?.getSettings().facingMode === 'user');
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          if (!cancelled) setCameraReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError('Camera access is required to scan.');
          setCameraReady(false);
        }
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [nativePreview, videoRef]);

  useEffect(() => {
    const bridge = window.AndroidDocumentCamera;
    if (!nativePreview || !bridge) return;

    let cancelled = false;
    let timer: number | undefined;
    setCameraError(null);
    setCameraReady(false);
    setMirrorPreview(false);
    void bridge
      .startPreview({ facingMode: 'environment' })
      .then(() => {
        if (!cancelled) setCameraReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError('The native camera could not start.');
          setCameraReady(false);
        }
      });

    const checkFocus = async () => {
      try {
        const focus = await bridge.focusState();
        if (!cancelled) {
          setAnalysis({
            bounds: captureGuideBounds(captureGuide),
            focused: focus.focused,
            documentDetected: focus.focused,
            score: focus.score ?? 0,
          });
        }
      } catch {
        if (!cancelled) setCameraError('Native autofocus data is unavailable.');
      } finally {
        if (!cancelled) timer = window.setTimeout(checkFocus, 220);
      }
    };
    void checkFocus();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      void bridge.stopPreview();
    };
  }, [captureGuide, nativePreview]);

  useEffect(() => {
    if (nativePreview || captureGuide === 'none') return;

    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 240;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;

    let cancelled = false;
    let timer: number | undefined;
    const inspect = () => {
      const source = videoRef.current;
      const ready = Boolean(source && source.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
      if (source && ready) {
        const displayAspect = source.clientWidth / source.clientHeight;
        const analysisHeight = Math.max(160, Math.min(280, Math.round(canvas.width / (displayAspect || 0.75))));
        if (canvas.height !== analysisHeight) canvas.height = analysisHeight;
        drawVisibleFrame(context, source, canvas.width, canvas.height);
        setAnalysis(
          analyzeFocus(context.getImageData(0, 0, canvas.width, canvas.height), captureGuideBounds(captureGuide))
        );
      }
      if (!cancelled) timer = window.setTimeout(inspect, 220);
    };
    inspect();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [captureGuide, nativePreview, videoRef]);

  const captureImage = useCallback(async (): Promise<string> => {
    const bridge = window.AndroidDocumentCamera;
    if (nativePreview && bridge) {
      return (await bridge.capture()).imageDataUrl;
    }

    const source = videoRef.current;
    if (!source) throw new Error('The camera image is not ready.');
    if (!source.videoWidth || !source.videoHeight) throw new Error('The camera image is not ready.');
    const displayAspect = source.clientWidth / source.clientHeight || 0.75;
    const crop = visibleFrameCrop(source, displayAspect);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(crop.width);
    canvas.height = Math.round(crop.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image capture is unavailable.');
    context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  }, [nativePreview, videoRef]);

  const refocusAt = useCallback(
    async (x: number, y: number): Promise<boolean> => {
      const bridge = window.AndroidDocumentCamera;
      if (nativePreview && bridge?.refocus) {
        await bridge.refocus({ x, y });
        return true;
      }

      const track = streamRef.current?.getVideoTracks()[0];
      if (!track) return false;
      const capabilities = track.getCapabilities() as CameraCapabilities;
      const focusMode = capabilities.focusMode?.includes('single-shot')
        ? 'single-shot'
        : capabilities.focusMode?.includes('continuous')
          ? 'continuous'
          : undefined;
      const constraint: CameraFocusConstraint = {
        ...(focusMode ? { focusMode } : {}),
        pointsOfInterest: [{ x, y }],
      };
      try {
        await track.applyConstraints({
          advanced: [constraint as MediaTrackConstraintSet],
        });
        return true;
      } catch {
        return false;
      }
    },
    [nativePreview]
  );

  return {
    analysis,
    cameraError,
    cameraReady,
    captureImage,
    mirrorPreview,
    nativePreview,
    refocusAt,
  };
}
