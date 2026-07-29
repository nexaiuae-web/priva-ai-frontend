import * as faceapi from "@vladmandic/face-api";

const MODEL_PATH = "/models";
const LOAD_TIMEOUT_MS = 15_000;
const DETECT_TIMEOUT_MS = 6_000;

let loaded = false;
let loadFailed = false;
let loadPromise: Promise<void> | null = null;

function timedPromise<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export async function loadFaceLandmarker(): Promise<void> {
  if (loaded) return;
  if (loadFailed) throw new Error("Face models previously failed to load. Refresh to retry.");
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      await timedPromise(
        Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_PATH),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_PATH),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_PATH),
        ]),
        LOAD_TIMEOUT_MS,
        "Model loading",
      );
      loaded = true;
    } catch (err) {
      loadFailed = true;
      loadPromise = null;
      throw err;
    }
  })();

  return loadPromise;
}

export function clearFaceLandmarker(): void {
  loaded = false;
  loadFailed = false;
  loadPromise = null;
}

export async function extractFaceLandmarkVector(
  video: HTMLVideoElement,
): Promise<Float32Array | null> {
  if (!loaded) throw new Error("Face AI models are still loading. Please wait.");

  try {
    const task = faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
    const result = await timedPromise(task.run(), DETECT_TIMEOUT_MS, "Face detection");
    if (!result) return null;
    return result.descriptor;
  } catch {
    return null;
  }
}
