import * as faceapi from "@vladmandic/face-api";

const MODEL_PATH = "/models";

let loaded = false;
let loadPromise: Promise<void> | null = null;

export async function loadFaceLandmarker(): Promise<void> {
  if (loaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_PATH),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_PATH),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_PATH),
    ]);
    loaded = true;
  })();

  return loadPromise;
}

export function clearFaceLandmarker(): void {
  loaded = false;
  loadPromise = null;
}

export async function extractFaceLandmarkVector(
  video: HTMLVideoElement,
): Promise<Float32Array | null> {
  if (!loaded) return null;

  const result = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();

  if (!result) return null;

  return result.descriptor;
}
