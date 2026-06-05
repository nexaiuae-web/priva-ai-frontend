import { buildApiUrl, buildClientHeaders, loadPlanMode, parseApiErrorPayload } from "./api";

export interface SupportChatMessage {
  id: string;
  role: "user" | "support";
  content: string;
  timestamp: string;
}

interface SupportMessageRow {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
}

interface SupportReplyRow {
  id: string;
  message_id: string;
  reply_text: string;
  created_at: string;
}

function readString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function mapMessageRow(row: Partial<SupportMessageRow>): SupportChatMessage | null {
  const id = readString(row.id);
  const message = readString(row.message);
  const createdAt = readString(row.created_at);
  if (!id || !message) return null;
  return {
    id,
    role: "user",
    content: message,
    timestamp: createdAt || new Date().toISOString(),
  };
}

function mapReplyRow(row: Partial<SupportReplyRow>): SupportChatMessage | null {
  const id = readString(row.id);
  const replyText = readString(row.reply_text);
  const createdAt = readString(row.created_at);
  if (!id || !replyText) return null;
  return {
    id,
    role: "support",
    content: replyText,
    timestamp: createdAt || new Date().toISOString(),
  };
}

export function mergeSupportThread(
  messages: SupportChatMessage[],
  replies: SupportChatMessage[],
): SupportChatMessage[] {
  return [...messages, ...replies].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/+$/, ""), anonKey };
}

async function supabaseSelect<T>(table: string, query: string): Promise<T[]> {
  const config = getSupabaseConfig();
  if (!config) return [];

  const res = await fetch(`${config.url}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new Error(`Supabase ${table} query failed (${res.status}): ${raw}`);
  }

  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as T[]) : [];
}

async function fetchMessagesFromSupabase(userId: string): Promise<SupportChatMessage[]> {
  const encodedUserId = encodeURIComponent(userId);
  const rows = await supabaseSelect<SupportMessageRow>(
    "support_messages",
    `user_id=eq.${encodedUserId}&select=id,user_id,message,created_at&order=created_at.asc`,
  );

  return rows
    .map(mapMessageRow)
    .filter((item): item is SupportChatMessage => item !== null);
}

async function fetchRepliesFromSupabase(messageIds: string[]): Promise<SupportChatMessage[]> {
  if (!messageIds.length) return [];

  const inList = messageIds.map((id) => encodeURIComponent(id)).join(",");
  const rows = await supabaseSelect<SupportReplyRow>(
    "support_replies",
    `message_id=in.(${inList})&select=id,message_id,reply_text,created_at&order=created_at.asc`,
  );

  return rows
    .map(mapReplyRow)
    .filter((item): item is SupportChatMessage => item !== null);
}

async function fetchThreadFromBackend(
  userId: string,
  token: string | null,
): Promise<SupportChatMessage[]> {
  const headers = await buildClientHeaders({
    token,
    planMode: loadPlanMode(),
    accept: "application/json",
  });

  const res = await fetch(
    `${buildApiUrl("/api/support")}?userId=${encodeURIComponent(userId)}`,
    { headers },
  );

  if (res.status === 404) return [];

  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    const parsed = parseApiErrorPayload(raw);
    throw new Error(
      parsed.message || parsed.error || `Support thread fetch failed (${res.status}).`,
    );
  }

  let payload: unknown = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload
      .map((row) => mapMessageRow(row as SupportMessageRow) ?? mapReplyRow(row as SupportReplyRow))
      .filter((item): item is SupportChatMessage => item !== null);
  }

  const root = payload as Record<string, unknown>;
  const messageRows = (
    Array.isArray(root.messages) ? root.messages : Array.isArray(root.data) ? root.data : []
  ) as SupportMessageRow[];
  const replyRows = (Array.isArray(root.replies) ? root.replies : []) as SupportReplyRow[];

  const messages = messageRows
    .map(mapMessageRow)
    .filter((item): item is SupportChatMessage => item !== null);
  const replies = replyRows
    .map(mapReplyRow)
    .filter((item): item is SupportChatMessage => item !== null);

  if (messages.length || replies.length) {
    return mergeSupportThread(messages, replies);
  }

  return [];
}

export async function fetchSupportThread(
  userId: string,
  token: string | null = null,
): Promise<SupportChatMessage[]> {
  if (getSupabaseConfig()) {
    const messages = await fetchMessagesFromSupabase(userId);
    const messageIds = messages.map((msg) => msg.id);
    const replies = await fetchRepliesFromSupabase(messageIds);
    return mergeSupportThread(messages, replies);
  }

  return fetchThreadFromBackend(userId, token);
}

export async function sendSupportMessage({
  message,
  userId,
  timestamp,
  token,
}: {
  message: string;
  userId: string;
  timestamp: string;
  token: string | null;
}): Promise<{ messageId?: string }> {
  const headers = await buildClientHeaders({
    token,
    planMode: loadPlanMode(),
    contentType: "application/json",
  });

  const res = await fetch(buildApiUrl("/api/support"), {
    method: "POST",
    headers,
    body: JSON.stringify({ message, userId, timestamp }),
  });

  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    const parsed = parseApiErrorPayload(raw);
    throw new Error(
      parsed.message || parsed.error || `Support request failed (${res.status}).`,
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }

  const messageId = readString(body.id, body.message_id, body.messageId);

  return { messageId: messageId || undefined };
}
