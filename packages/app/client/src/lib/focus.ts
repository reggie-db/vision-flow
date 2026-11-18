import type { CaptureGuide } from '../../../shared/vision-contracts.ts';

export interface FocusBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FocusAnalysis {
  bounds: FocusBounds;
  focused: boolean;
  documentDetected: boolean;
  score: number;
}

export const CAPTURE_GUIDE_BOUNDS: Record<Exclude<CaptureGuide, 'none'>, FocusBounds> = {
  vertical: {
    x: 0.19,
    y: 0.15,
    width: 0.62,
    height: 0.62,
  },
  horizontal: {
    x: 0.08,
    y: 0.31,
    width: 0.84,
    height: 0.25,
  },
};

export function captureGuideBounds(captureGuide: CaptureGuide): FocusBounds {
  return captureGuide === 'none'
    ? { x: 0, y: 0, width: 1, height: 1 }
    : CAPTURE_GUIDE_BOUNDS[captureGuide];
}

export function initialFocusAnalysis(captureGuide: CaptureGuide): FocusAnalysis {
  return {
    bounds: captureGuideBounds(captureGuide),
    focused: false,
    documentDetected: false,
    score: 0,
  };
}

/** Detect a document-like region inside the configured guide and estimate its sharpness. */
export function analyzeFocus(image: ImageData, guide: FocusBounds): FocusAnalysis {
  const { data, width, height } = image;
  const grayscale = new Float32Array(width * height);
  const guideLeft = Math.max(1, Math.floor(guide.x * width));
  const guideTop = Math.max(1, Math.floor(guide.y * height));
  const guideRight = Math.min(width - 1, Math.ceil((guide.x + guide.width) * width));
  const guideBottom = Math.min(
    height - 1,
    Math.ceil((guide.y + guide.height) * height)
  );
  const guideWidth = guideRight - guideLeft;
  const guideHeight = guideBottom - guideTop;
  const paperByRow = new Uint16Array(guideHeight);
  const paperByColumn = new Uint16Array(guideWidth);
  let paperPixelCount = 0;
  let darkInkPixelCount = 0;

  for (let index = 0; index < grayscale.length; index += 1) {
    const offset = index * 4;
    const red = data[offset]!;
    const green = data[offset + 1]!;
    const blue = data[offset + 2]!;
    const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
    grayscale[index] = luminance;

    const x = index % width;
    const y = Math.floor(index / width);
    if (x < guideLeft || x >= guideRight || y < guideTop || y >= guideBottom) continue;

    const neutralBright = luminance >= 165 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 42;
    if (neutralBright) {
      paperPixelCount += 1;
      paperByRow[y - guideTop]! += 1;
      paperByColumn[x - guideLeft]! += 1;
    } else if (luminance <= 125) {
      darkInkPixelCount += 1;
    }
  }

  let laplacianSum = 0;
  let laplacianSquaredSum = 0;
  let sampleCount = 0;
  let edgeCount = 0;

  for (let y = guideTop; y < guideBottom; y += 1) {
    for (let x = guideLeft; x < guideRight; x += 1) {
      const index = y * width + x;
      const laplacian =
        grayscale[index]! * 4 -
        grayscale[index - 1]! -
        grayscale[index + 1]! -
        grayscale[index - width]! -
        grayscale[index + width]!;
      laplacianSum += laplacian;
      laplacianSquaredSum += laplacian * laplacian;
      sampleCount += 1;

      if (Math.abs(laplacian) > 42) {
        edgeCount += 1;
      }
    }
  }

  const mean = laplacianSum / sampleCount;
  const score = laplacianSquaredSum / sampleCount - mean * mean;
  const enoughEdges = edgeCount / sampleCount > 0.018;
  const guidePixelCount = guideWidth * guideHeight;
  const paperRatio = paperPixelCount / guidePixelCount;
  const inkRatio = darkInkPixelCount / guidePixelCount;
  const paperRowCoverage =
    paperByRow.filter((count) => count / guideWidth >= 0.48).length / guideHeight;
  const paperColumnCoverage =
    paperByColumn.filter((count) => count / guideHeight >= 0.48).length / guideWidth;
  const documentDetected =
    paperRatio >= 0.48 &&
    paperRowCoverage >= 0.56 &&
    paperColumnCoverage >= 0.5 &&
    inkRatio >= 0.012;

  return {
    bounds: guide,
    focused: documentDetected && enoughEdges && score >= 190,
    documentDetected,
    score,
  };
}
