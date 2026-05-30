export interface UploadProgressState {
  percent: number;
  phase: string;
  current: number;
  total: number;
}

export class UploadSseError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "UploadSseError";
    this.code = code;
  }
}

function extractUploadError(parsed: unknown): UploadSseError | null {
  if (!parsed || typeof parsed !== "object") return null;

  const roots: Record<string, unknown>[] = [parsed as Record<string, unknown>];
  const nested = (parsed as Record<string, unknown>).data;
  if (nested && typeof nested === "object") {
    roots.push(nested as Record<string, unknown>);
  }

  for (const root of roots) {
    const code = root.error;
    if (code === "STORAGE_LIMIT_REACHED" || code === "USER_LIMIT_REACHED") {
      const message =
        typeof root.message === "string"
          ? root.message
          : code === "STORAGE_LIMIT_REACHED"
            ? "Storage limit reached. Please contact the administrator to upgrade your plan."
            : "Users limit reached. Please contact the administrator to upgrade your plan.";
      return new UploadSseError(message, String(code));
    }
  }

  return null;
}

export function parseUploadSsePayload(parsed: unknown): UploadProgressState | null {
  if (!parsed || typeof parsed !== "object") return null;

  const root = parsed as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;

  const percent = Number(data.percent);
  const phase =
    typeof data.phase === "string"
      ? data.phase
      : typeof data.message === "string"
        ? data.message
        : "";
  const current = Number(data.current);
  const total = Number(data.total);

  if (!Number.isFinite(percent) && !phase) return null;

  return {
    percent: Number.isFinite(percent)
      ? Math.min(100, Math.max(0, percent))
      : 0,
    phase,
    current: Number.isFinite(current) ? current : 0,
    total: Number.isFinite(total) ? total : 0,
  };
}

export async function consumeUploadSseStream(
  body: ReadableStream<Uint8Array>,
  onProgress: (progress: UploadProgressState) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      if (dataLines.length === 0) continue;

      const payload = dataLines.join("\n");
      if (!payload || payload === "[DONE]") continue;

      try {
        const parsed = JSON.parse(payload) as unknown;
        const uploadError = extractUploadError(parsed);
        if (uploadError) throw uploadError;
        const progress = parseUploadSsePayload(parsed);
        if (progress) onProgress(progress);
      } catch (err) {
        if (err instanceof UploadSseError) throw err;
        // ignore malformed SSE chunks
      }
    }
  }

  if (buffer.trim()) {
    const lines = buffer.split("\n");
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trimStart();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload) as unknown;
        const uploadError = extractUploadError(parsed);
        if (uploadError) throw uploadError;
        const progress = parseUploadSsePayload(parsed);
        if (progress) onProgress(progress);
      } catch (err) {
        if (err instanceof UploadSseError) throw err;
        // ignore trailing parse errors
      }
    }
  }
}
