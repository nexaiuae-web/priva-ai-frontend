import {
  buildApiUrl,
  buildClientHeaders,
  DOCUMENTS_API,
  loadPlanMode,
  parseApiErrorPayload,
  STORAGE_LIMIT_MESSAGE,
  TRIAL_STORAGE_MESSAGE,
  USER_STORAGE_LIMIT_MESSAGE,
} from "./api";
import type { UploadProgressState } from "./upload-sse";

const PENDING_UPLOADS_KEY = "priva_pending_uploads";
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 900;

export interface BackgroundUploadAccepted {
  upload_id: string;
  job_id: string;
  status: string;
  message?: string;
  filename?: string;
  poll_url?: string;
}

export interface UploadStatusResponse {
  upload_id: string;
  job_id: string;
  status: string;
  percent: number;
  phase: string;
  current: number;
  total: number;
  message: string;
  filename?: string;
  result?: {
    id: string;
    filename: string;
    uploadedAt?: string;
    message?: string;
  };
  error?: string;
}

export interface PendingUploadRecord {
  uploadId: string;
  filename: string;
  companyId: string;
  userId?: string;
  startedAt: string;
}

export function getWorkspaceUserIdFromToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const payload = JSON.parse(atob(padded)) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub.trim()
      ? payload.sub.trim()
      : null;
  } catch {
    return null;
  }
}

function readPendingUploads(): PendingUploadRecord[] {
  try {
    const raw = localStorage.getItem(PENDING_UPLOADS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingUploadRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingUploads(records: PendingUploadRecord[]) {
  localStorage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(records));
}

export function trackPendingUpload(record: PendingUploadRecord) {
  const list = readPendingUploads().filter(
    (item) => item.uploadId !== record.uploadId,
  );
  list.push(record);
  writePendingUploads(list);
}

export function clearPendingUpload(uploadId: string) {
  writePendingUploads(
    readPendingUploads().filter((item) => item.uploadId !== uploadId),
  );
}

function resolveStatusPollUrl(uploadId: string, pollUrl?: string): string {
  if (pollUrl) {
    if (pollUrl.startsWith("http://") || pollUrl.startsWith("https://")) {
      return pollUrl;
    }
    return buildApiUrl(pollUrl.startsWith("/") ? pollUrl : `/${pollUrl}`);
  }
  return `${DOCUMENTS_API}/status/${encodeURIComponent(uploadId)}`;
}

function isTerminalUploadStatus(status: string): boolean {
  const normalized = String(status || "").trim().toLowerCase();
  return (
    normalized === "complete" ||
    normalized === "completed" ||
    normalized === "success" ||
    normalized === "done"
  );
}

function isErrorUploadStatus(status: string): boolean {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "error" || normalized === "failed";
}

function resolveProgressPercent(status: UploadStatusResponse): number {
  const reported = Number(status.percent);
  if (Number.isFinite(reported) && reported > 0) {
    return Math.min(100, Math.max(0, reported));
  }

  const phase = String(status.phase || status.status || "")
    .trim()
    .toLowerCase();

  const phaseMap: Record<string, number> = {
    queued: 2,
    received: 2,
    processing: 8,
    extracting: 15,
    chunking: 22,
    saving: 24,
    embedding: 55,
    indexing: 98,
    complete: 100,
    completed: 100,
    success: 100,
    done: 100,
  };

  if (phaseMap[phase] != null) {
    return phaseMap[phase];
  }

  if (isTerminalUploadStatus(status.status)) {
    return 100;
  }

  return 2;
}

function statusToProgress(status: UploadStatusResponse): UploadProgressState {
  return {
    percent: resolveProgressPercent(status),
    phase: status.message || status.phase || status.status,
    current: Number(status.current) || 0,
    total: Number(status.total) || 0,
  };
}

function buildUploadError(status: UploadStatusResponse): Error {
  const err = new Error(status.error || "Background processing failed.");
  const lowered = String(status.error || "").toLowerCase();
  const storageHit =
    status.error === STORAGE_LIMIT_MESSAGE ||
    lowered.includes("company storage quota");
  const userStorageHit =
    status.error === USER_STORAGE_LIMIT_MESSAGE ||
    lowered.includes("personal storage quota");
  (err as Error & { code?: string }).code = userStorageHit
    ? "USER_STORAGE_LIMIT_REACHED"
    : storageHit
      ? "STORAGE_LIMIT_REACHED"
      : undefined;
  return err;
}

export async function fetchUploadStatus(
  uploadId: string,
  token: string,
  pollUrl?: string,
): Promise<UploadStatusResponse> {
  const url = resolveStatusPollUrl(uploadId, pollUrl);
  console.log("[BG-UPLOAD] GET status", url);
  const headers = await buildClientHeaders({ token, planMode: loadPlanMode(), accept: "application/json" });

  const res = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  const body = await res.json().catch(() => ({}));
  console.log("[BG-UPLOAD] status response", {
    uploadId,
    httpStatus: res.status,
    jobStatus: body?.status,
    percent: body?.percent,
    phase: body?.phase,
  });

  if (res.status === 404) {
    clearPendingUpload(uploadId);
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : "Upload job not found or no longer accessible.",
    );
  }

  if (!res.ok) {
    const message =
      typeof body.error === "string"
        ? body.error
        : typeof body.message === "string"
          ? body.message
          : `Status check failed (${res.status})`;
    throw new Error(message);
  }

  return body as UploadStatusResponse;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollUploadUntilComplete(
  uploadId: string,
  token: string,
  onProgress?: (progress: UploadProgressState) => void,
  pollUrl?: string,
): Promise<UploadStatusResponse> {
  let lastProgress: UploadProgressState | null = null;

  console.log("[BG-UPLOAD] poll loop start", { uploadId, pollUrl });

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    try {
      console.log("[BG-UPLOAD] poll attempt", attempt + 1, uploadId);

      const status = await fetchUploadStatus(uploadId, token, pollUrl);
      const progress = statusToProgress(status);
      lastProgress = progress;

      console.log("[BG-UPLOAD] poll tick", {
        attempt: attempt + 1,
        status: status.status,
        percent: progress.percent,
        phase: progress.phase,
      });

      onProgress?.(progress);

      if (isTerminalUploadStatus(status.status)) {
        console.log("[BG-UPLOAD] poll complete", uploadId);
        clearPendingUpload(uploadId);
        onProgress?.({
          percent: 100,
          phase: status.message || "Upload and indexing complete",
          current: Number(status.current) || 0,
          total: Number(status.total) || 0,
        });
        return status;
      }

      if (isErrorUploadStatus(status.status)) {
        console.warn("[BG-UPLOAD] poll error status", status.status, status.error);
        clearPendingUpload(uploadId);
        throw buildUploadError(status);
      }
    } catch (error) {
      console.error("[BG-UPLOAD] poll attempt failed", attempt + 1, error);
      throw error instanceof Error ? error : new Error(String(error));
    }

    await sleep(POLL_INTERVAL_MS);
  }

  if (lastProgress) {
    onProgress?.(lastProgress);
  }

  throw new Error("Background upload timed out while waiting for processing.");
}

/** Fire-and-forget — must never block the upload polling loop. */
function notifyServiceWorkerOfUpload(uploadId: string, filename: string): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  void (async () => {
    try {
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        sleep(1500).then(() => null),
      ]);
      registration?.active?.postMessage({
        type: "PRIVA_TRACK_UPLOAD",
        uploadId,
        filename,
      });
    } catch (err) {
      console.warn("[BG-UPLOAD] service worker notify skipped:", err);
    }
  })();
}

export async function uploadDocumentInBackground(
  file: File,
  {
    token,
    companyId,
    userId,
    folderId = null,
    onProgress,
    onAccepted,
    onComplete,
  }: {
    token: string;
    companyId: string;
    userId?: string | null;
    folderId?: string | null;
    onProgress?: (progress: UploadProgressState) => void;
    onAccepted?: (accepted: BackgroundUploadAccepted) => void;
    onComplete?: (status: UploadStatusResponse) => void;
  },
): Promise<UploadStatusResponse> {
  const scopedUserId = userId || getWorkspaceUserIdFromToken(token);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("company_id", companyId);
  if (folderId) {
    formData.append("folder_id", folderId);
  }

  onProgress?.({
    percent: 0,
    phase: "Uploading file to server…",
    current: 0,
    total: 0,
  });

  const res = await fetch(DOCUMENTS_API, {
    method: "POST",
    headers: await buildClientHeaders({ token, planMode: loadPlanMode() }),
    body: formData,
  });

  const raw = await res.text();
  let body: BackgroundUploadAccepted & { error?: string; message?: string } = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { message: raw };
  }

  if (!res.ok) {
    const parsed = parseApiErrorPayload(raw);
    if (parsed.error === "STORAGE_LIMIT_REACHED") {
      const err = new Error(parsed.message || STORAGE_LIMIT_MESSAGE);
      (err as Error & { code?: string }).code = "STORAGE_LIMIT_REACHED";
      throw err;
    }
    if (parsed.error === "USER_STORAGE_LIMIT_REACHED") {
      const err = new Error(parsed.message || USER_STORAGE_LIMIT_MESSAGE);
      (err as Error & { code?: string }).code = "USER_STORAGE_LIMIT_REACHED";
      throw err;
    }
    if (parsed.error === "TRIAL_STORAGE_EXCEEDED") {
      const err = new Error(parsed.message || TRIAL_STORAGE_MESSAGE);
      (err as Error & { code?: string }).code = "TRIAL_STORAGE_EXCEEDED";
      throw err;
    }
    throw new Error(
      parsed.message || body.message || `Upload failed (${res.status}).`,
    );
  }

  const uploadId = body.upload_id || body.job_id;
  if (!uploadId) {
    throw new Error("Server did not return an upload_id for background processing.");
  }

  const pollUrl = body.poll_url;

  trackPendingUpload({
    uploadId,
    filename: file.name,
    companyId,
    userId: scopedUserId || undefined,
    startedAt: new Date().toISOString(),
  });

  onAccepted?.({ ...body, upload_id: uploadId, job_id: uploadId });

  console.log("[BG-UPLOAD] upload accepted, starting poll", {
    uploadId,
    pollUrl,
  });

  notifyServiceWorkerOfUpload(uploadId, file.name);

  const finalStatus = await pollUploadUntilComplete(
    uploadId,
    token,
    onProgress,
    pollUrl,
  );

  console.log("[BG-UPLOAD] upload finished", uploadId, finalStatus.status);

  onComplete?.(finalStatus);
  return finalStatus;
}

export async function resumePendingUploads(
  token: string,
  companyId: string,
  handlers: {
    userId?: string | null;
    activeUploadId?: string | null;
    onProgress?: (uploadId: string, progress: UploadProgressState) => void;
    onComplete?: (uploadId: string, status: UploadStatusResponse) => void;
    onError?: (uploadId: string, error: Error) => void;
  } = {},
): Promise<void> {
  const scopedUserId = handlers.userId || getWorkspaceUserIdFromToken(token);
  const pending = readPendingUploads().filter((item) => {
    if (item.companyId !== companyId) return false;
    if (scopedUserId && item.userId && item.userId !== scopedUserId) return false;
    if (handlers.activeUploadId && item.uploadId === handlers.activeUploadId) {
      return false;
    }
    return true;
  });

  if (!pending.length) return;

  console.log("[BG-UPLOAD] Resuming", pending.length, "pending upload(s)");

  await Promise.all(
    pending.map(async (item) => {
      try {
        const finalStatus = await pollUploadUntilComplete(
          item.uploadId,
          token,
          (progress) => {
            handlers.onProgress?.(item.uploadId, progress);
          },
        );
        handlers.onComplete?.(item.uploadId, finalStatus);
      } catch (error) {
        clearPendingUpload(item.uploadId);
        handlers.onError?.(
          item.uploadId,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }),
  );
}

export function registerBackgroundUploadServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => console.log("[BG-UPLOAD] Service worker registered:", reg.scope))
      .catch((err) => console.warn("[BG-UPLOAD] Service worker registration failed:", err));
  });
}
