/** Minimum lighting/quality score (0–1) before suggesting the ring-light guide. */
const MIN_QUALITY_SCORE = 0.55;

/** How far the face box center may drift from the frame center (fraction of width/height). */
const MAX_CENTER_OFFSET_RATIO = 0.14;

declare global {
  interface Window {
    FaceDetector?: new (options?: { maxDetectedFaces?: number; fastMode?: boolean }) => {
      detect: (source: CanvasImageSource) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
    };
  }
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceFrameAnalysis {
  needsFlash: boolean;
  score: number;
  centered: boolean;
  box: FaceBox | null;
}

function measureLightingScore(
  video: HTMLVideoElement,
  box: FaceBox | null,
): number {
  const canvas = document.createElement("canvas");
  const sampleSize = 64;
  canvas.width = sampleSize;
  canvas.height = sampleSize;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || video.videoWidth === 0) return 0;

  const vw = video.videoWidth;
  const vh = video.videoHeight;

  let sx: number;
  let sy: number;
  let sw: number;
  let sh: number;

  if (box) {
    sx = box.x;
    sy = box.y;
    sw = box.width;
    sh = box.height;
  } else {
    const region = Math.min(vw, vh) * 0.55;
    sx = (vw - region) / 2;
    sy = (vh - region) / 2;
    sw = region;
    sh = region;
  }

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sampleSize, sampleSize);
  const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data;

  let sum = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  const avg = sum / pixels / 255;
  const ideal = 0.48;
  const deviation = Math.abs(avg - ideal);
  return Math.max(0, Math.min(1, 1 - deviation * 2.2));
}

function isBoxCentered(box: FaceBox, videoWidth: number, videoHeight: number): boolean {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const maxOffsetX = videoWidth * MAX_CENTER_OFFSET_RATIO;
  const maxOffsetY = videoHeight * MAX_CENTER_OFFSET_RATIO;

  const sizeOk =
    box.width >= videoWidth * 0.22 &&
    box.width <= videoWidth * 0.78 &&
    box.height >= videoHeight * 0.22;

  return (
    Math.abs(cx - videoWidth / 2) <= maxOffsetX &&
    Math.abs(cy - videoHeight / 2) <= maxOffsetY &&
    sizeOk
  );
}

async function detectFaceBox(video: HTMLVideoElement): Promise<FaceBox | null> {
  if (!window.FaceDetector) return null;

  try {
    const detector = new window.FaceDetector({ maxDetectedFaces: 1, fastMode: true });
    const faces = await detector.detect(video);
    const box = faces[0]?.boundingBox;
    if (!box) return null;

    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    };
  } catch {
    return null;
  }
}

/** Analyze the current video frame for face position and lighting quality. */
export async function analyzeFaceFrame(video: HTMLVideoElement): Promise<FaceFrameAnalysis> {
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    return { needsFlash: false, score: 0, centered: false, box: null };
  }

  const box = await detectFaceBox(video);
  const score = measureLightingScore(video, box);

  if (!box) {
    return {
      needsFlash: score < MIN_QUALITY_SCORE,
      score,
      centered: false,
      box: null,
    };
  }

  const centered = isBoxCentered(box, video.videoWidth, video.videoHeight);
  const needsFlash = !centered || score < MIN_QUALITY_SCORE;

  return { needsFlash, score, centered, box };
}
