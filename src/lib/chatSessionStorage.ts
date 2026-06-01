import type { AuthSession, PlanMode } from "./api";
import { PLAN_MODE_STORAGE_KEY } from "./api";

const CHAT_STORAGE_PREFIX = "priva_chat_messages_v2:";
const LEGACY_CHAT_STORAGE_KEY = "priva_chat_messages";
const DEVICE_FINGERPRINT_KEY = "priva_device_fingerprint";

export interface StoredChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: unknown[];
}

export const DEFAULT_WELCOME_MESSAGE: StoredChatMessage = {
  role: "assistant",
  content:
    "Welcome. Ask a question and PRIVA AI will cite your uploaded knowledge files.",
};

function canUseWebStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readStoredFingerprint(): string {
  if (!canUseWebStorage()) return "anonymous";
  return localStorage.getItem(DEVICE_FINGERPRINT_KEY)?.trim() || "anonymous";
}

export function buildChatStorageScopeKey(
  session: Pick<AuthSession, "token" | "companyId"> | null,
  planMode: PlanMode = "premium",
): string {
  if (!session?.token) return "anonymous";

  if (planMode === "free_trial" || session.token === "trial_guest") {
    return `trial:${readStoredFingerprint()}`;
  }

  const companyId = String(session.companyId || "default")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  const tokenScope = session.token.slice(0, 12).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `company:${companyId}:${tokenScope}`;
}

function storageKeyForScope(scopeKey: string): string {
  return `${CHAT_STORAGE_PREFIX}${scopeKey}`;
}

export function loadChatMessagesForScope(scopeKey: string): StoredChatMessage[] {
  if (!canUseWebStorage()) {
    return [DEFAULT_WELCOME_MESSAGE];
  }

  try {
    const raw = localStorage.getItem(storageKeyForScope(scopeKey));
    if (!raw) return [DEFAULT_WELCOME_MESSAGE];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [DEFAULT_WELCOME_MESSAGE];
    }

    const valid = parsed.filter(
      (item): item is StoredChatMessage =>
        Boolean(item) &&
        typeof item === "object" &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string",
    );

    return valid.length > 0 ? valid : [DEFAULT_WELCOME_MESSAGE];
  } catch {
    return [DEFAULT_WELCOME_MESSAGE];
  }
}

export function saveChatMessagesForScope(
  scopeKey: string,
  messages: StoredChatMessage[],
): void {
  if (!canUseWebStorage()) return;
  try {
    localStorage.setItem(storageKeyForScope(scopeKey), JSON.stringify(messages));
  } catch (err) {
    console.warn("[Chat] failed to persist scoped messages:", err);
  }
}

export function clearAllChatMessageStorage(): void {
  if (!canUseWebStorage()) return;

  localStorage.removeItem(LEGACY_CHAT_STORAGE_KEY);

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(CHAT_STORAGE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}

export function clearWorkspaceClientState(): void {
  clearAllChatMessageStorage();
  if (!canUseWebStorage()) return;
  localStorage.removeItem("priva_pending_uploads");
  sessionStorage.removeItem("priva_face_verified");
}

export function readPlanModeFromStorage(): PlanMode {
  if (!canUseWebStorage()) return "premium";
  const raw = localStorage.getItem(PLAN_MODE_STORAGE_KEY);
  return raw === "free_trial" ? "free_trial" : "premium";
}
