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
    if (parsed && typeof parsed === "object" && parsed.type) return parsed;
    return null;
  } catch {
    return { type: "token", text: payload };
  }
}

export function extractTokenFromChatPayload(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const payload = parsed as Record<string, unknown>;
  if (typeof payload.text === "string") return payload.text;
  const choices = payload.choices as
    | Array<{ delta?: { content?: string } }>
    | undefined;
  if (choices?.[0]?.delta?.content) return choices[0].delta.content;
  if (typeof payload.content === "string") return payload.content;
  return null;
}
