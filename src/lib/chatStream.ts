import type { ChatSourceRef } from "./chatCitations";

export interface ChatStreamEvent {
  type: "token" | "sources" | "done" | "error" | string;
  text?: string;
  sources?: ChatSourceRef[];
  /** Deduplicated filenames from all chunks used in the answer */
  source_filenames?: string[];
  answer?: string;
  message?: string;
}

export function parseChatStreamPayload(payload: string): ChatStreamEvent | null {
  if (!payload || payload === "[DONE]") return null;
  try {
    const parsed = JSON.parse(payload) as ChatStreamEvent;
    if (parsed && typeof parsed === "object") {
      // Some backends (notably the company/workspace chat path) emit chunks
      // without an explicit `type` field. Keep them so the legacy token
      // extraction below can pull the text out of the envelope.
      if (parsed.type) return parsed;
      return parsed;
    }
    return null;
  } catch {
    return { type: "token", text: payload };
  }
}

export function extractTokenFromChatPayload(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const payload = parsed as Record<string, unknown>;
  // Company/workspace backends may use any of these envelope fields.
  for (const key of ["text", "content", "response", "reply", "answer", "message", "output", "result"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  const choices = payload.choices as
    | Array<{ delta?: { content?: string } }>
    | undefined;
  if (choices?.[0]?.delta?.content) return choices[0].delta.content;
  // Nested data envelopes.
  if (payload.data && typeof payload.data === "object") {
    return extractTokenFromChatPayload(payload.data);
  }
  return null;
}
