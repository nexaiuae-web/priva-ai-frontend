import { getDeviceFingerprint } from "./deviceFingerprint";
import { clearWorkspaceClientState } from "./chatSessionStorage";

export { clearWorkspaceClientState } from "./chatSessionStorage";
import type { AppLocale } from "./locale";
import { resolveAppLocale } from "./locale";

const PRODUCTION_API_URL = "https://priva-ai-api.onrender.com";

function normalizeApiBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function getConfiguredApiBaseUrl(): string {
  return normalizeApiBaseUrl(import.meta.env.VITE_API_URL || PRODUCTION_API_URL);
}

/** Dev uses same-origin `/api` (Vite proxy). Production uses the configured backend URL. */
export function getApiBaseUrl(): string {
  return import.meta.env.PROD ? getConfiguredApiBaseUrl() : "";
}

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export const API_BASE = getApiBaseUrl();

const MASTER_KEY = import.meta.env.VITE_MASTER_KEY?.trim() || "";

export const DOCUMENTS_API = buildApiUrl("/api/documents");
export const FOLDERS_API = buildApiUrl("/api/folders");

export const FOLDER_EMPTY_MESSAGE = "No information found in this folder.";

export const STORAGE_LIMIT_MESSAGE =
  "Upload blocked: The company storage quota limit has been exceeded. Please upgrade your plan.";

export const USER_STORAGE_LIMIT_MESSAGE =
  "Upload blocked: Your personal storage quota has been exceeded. Contact your administrator.";

export type PlanMode = "premium" | "free_trial";
export const PLAN_MODE_STORAGE_KEY = "priva_plan_mode";
export const TRIAL_LIMIT_MESSAGE = "Free Trial daily question limit reached (5 per 24 hours).";
export const TRIAL_STORAGE_MESSAGE = "Free Trial storage quota exceeded (5MB max).";

export const DEFAULT_TRIAL_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;

export const STORAGE_QUOTA_EXCEEDED_AR =
  "خطأ: حجم الملف يتجاوز المساحة المتبقية المتاحة لحسابك (الحد الأقصى 5 ميجابايت)";

export const STORAGE_QUOTA_EXCEEDED_EN =
  "Error: File size exceeds the remaining storage quota for your account (Max 5MB)";

export function getStorageQuotaExceededMessage(locale?: AppLocale): string {
  const activeLocale = locale ?? resolveAppLocale();
  return activeLocale === "ar" ? STORAGE_QUOTA_EXCEEDED_AR : STORAGE_QUOTA_EXCEEDED_EN;
}

const STORAGE_LIMIT_ERROR_CODES = new Set([
  "STORAGE_LIMIT_REACHED",
  "USER_STORAGE_LIMIT_REACHED",
  "TRIAL_STORAGE_EXCEEDED",
]);

export interface StorageQuotaSnapshot {
  usedBytes: number;
  limitBytes: number;
}

export function wouldExceedStorageQuota(
  usedBytes: number,
  limitBytes: number,
  fileSizeBytes: number,
): boolean {
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) return false;
  if (!Number.isFinite(limitBytes) || limitBytes <= 0) return false;
  return usedBytes + fileSizeBytes > limitBytes;
}

export function isStorageLimitErrorCode(code?: string | null): boolean {
  return Boolean(code && STORAGE_LIMIT_ERROR_CODES.has(code));
}

export function isStorageLimitHttpStatus(status: number): boolean {
  return status === 400 || status === 413 || status === 507;
}

export function isStorageLimitApiPayload(parsed: {
  error?: string;
  code?: string;
  message?: string;
}): boolean {
  if (isStorageLimitErrorCode(parsed.error) || isStorageLimitErrorCode(parsed.code)) {
    return true;
  }
  const combined = `${parsed.error ?? ""} ${parsed.code ?? ""} ${parsed.message ?? ""}`.toLowerCase();
  return (
    combined.includes("storage") ||
    combined.includes("quota") ||
    combined.includes("limit exceeded") ||
    combined.includes("trial_storage")
  );
}

export function resolveStorageLimitMessage(
  parsed: { error?: string; code?: string; message?: string },
  locale?: AppLocale,
): string {
  if (parsed.message?.trim()) return parsed.message.trim();
  const code = parsed.error || parsed.code;
  if (code === "USER_STORAGE_LIMIT_REACHED") return USER_STORAGE_LIMIT_MESSAGE;
  if (code === "TRIAL_STORAGE_EXCEEDED") return TRIAL_STORAGE_MESSAGE;
  if (code === "STORAGE_LIMIT_REACHED") return STORAGE_LIMIT_MESSAGE;
  return getStorageQuotaExceededMessage(locale);
}

export function createStorageLimitError(
  parsed: { error?: string; code?: string; message?: string },
  locale?: AppLocale,
): Error {
  const code = parsed.error || parsed.code || "STORAGE_LIMIT_REACHED";
  const err = new Error(resolveStorageLimitMessage(parsed, locale));
  (err as Error & { code?: string }).code = code;
  return err;
}

export function resolveUploadErrorMessage(err: unknown, locale?: AppLocale): string {
  const quotaMessage = getStorageQuotaExceededMessage(locale);
  const uploadFailedMessage = locale === "ar"
    ? "فشل الرفع. يرجى المحاولة مرة أخرى."
    : "Upload failed. Please try again.";

  if (!(err instanceof Error)) return uploadFailedMessage;
  if (isStorageLimitErrorCode(err.code)) {
    if (err.message.trim() === STORAGE_QUOTA_EXCEEDED_AR && locale === "en") {
      return STORAGE_QUOTA_EXCEEDED_EN;
    }
    if (err.message.trim() === STORAGE_QUOTA_EXCEEDED_EN && locale === "ar") {
      return STORAGE_QUOTA_EXCEEDED_AR;
    }
    return err.message.trim() || quotaMessage;
  }
  if (err.message.trim()) return err.message.trim();
  return uploadFailedMessage;
}

export async function fetchStorageQuotaSnapshot({
  token,
  planMode,
  cached,
}: {
  token: string;
  planMode: PlanMode;
  cached?: StorageQuotaSnapshot | null;
}): Promise<StorageQuotaSnapshot | null> {
  if (cached && cached.limitBytes > 0) return cached;

  if (planMode !== "free_trial" && token !== "trial_guest") {
    return null;
  }

  try {
    const status = await fetchTrialStatus({ token, planMode });
    const trial = status?.trial;
    if (!trial || typeof trial !== "object") {
      return {
        usedBytes: 0,
        limitBytes: DEFAULT_TRIAL_STORAGE_LIMIT_BYTES,
      };
    }
    return {
      usedBytes: Number(trial.storage_used_bytes) || 0,
      limitBytes: Number(trial.storage_limit_bytes) || DEFAULT_TRIAL_STORAGE_LIMIT_BYTES,
    };
  } catch {
    return {
      usedBytes: 0,
      limitBytes: DEFAULT_TRIAL_STORAGE_LIMIT_BYTES,
    };
  }
}

function canUseWebStorage(): boolean {
  return typeof window !== "undefined";
}

export function parseApiErrorPayload(raw: string): {
  error?: string;
  code?: string;
  message?: string;
} {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      error: typeof parsed.error === "string" ? parsed.error : undefined,
      code: typeof parsed.code === "string" ? parsed.code : undefined,
      message: typeof parsed.message === "string" ? parsed.message : undefined,
    };
  } catch {
    return { message: raw };
  }
}

export function loadPlanMode(): PlanMode {
  if (!canUseWebStorage()) {
    return "free_trial";
  }
  const raw = localStorage.getItem(PLAN_MODE_STORAGE_KEY);
  return raw === "free_trial" ? "free_trial" : "premium";
}

export function persistPlanMode(mode: PlanMode): void {
  if (!canUseWebStorage()) return;
  localStorage.setItem(PLAN_MODE_STORAGE_KEY, mode);
}

export async function buildClientHeaders({
  token = null,
  planMode = "premium",
  contentType = null,
  accept = null,
}: {
  token?: string | null;
  planMode?: PlanMode;
  contentType?: string | null;
  accept?: string | null;
} = {}): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (contentType) headers["Content-Type"] = contentType;
  if (accept) headers.Accept = accept;
  if (token) headers.Authorization = `Bearer ${token}`;
  const fingerprint = await getDeviceFingerprint();
  headers["x-device-fingerprint"] = fingerprint;
  const effectivePlanMode: PlanMode = token === "trial_guest" ? "free_trial" : planMode;
  headers["x-plan-mode"] = effectivePlanMode;
  if (MASTER_KEY) {
    headers["x-master-key"] = MASTER_KEY;
  }
  return headers;
}

export interface TrialStatusPayload {
  is_trial_mode: boolean;
  fingerprint_hash: string | null;
  trial: {
    request_count: number;
    request_limit: number;
    remaining_requests: number;
    storage_used_bytes: number;
    storage_limit_bytes: number;
    storage_remaining_bytes: number;
    first_request_at: string | null;
    window_reset_at: string | null;
  };
}

export async function fetchTrialStatus({
  token = null,
  planMode = "premium",
}: {
  token?: string | null;
  planMode?: PlanMode;
} = {}): Promise<TrialStatusPayload> {
  const headers = await buildClientHeaders({ token, planMode });
  const res = await fetch(buildApiUrl("/api/trial/status"), { headers });
  const body = (await res.json().catch(() => ({}))) as TrialStatusPayload;
  if (!res.ok) {
    throw new Error("Failed to load trial status.");
  }
  return body;
}

export const AUTH_STORAGE_KEYS = {
  token: "priva_token",
  companyId: "priva_company",
  companyName: "priva_company_name",
  user: "priva_user",
  legacyCompanyName: "company_name",
} as const;

export const FACE_VERIFIED_KEY = "priva_face_verified";

export const FACE_VERIFY_FAILED_MESSAGE =
  "Face verification failed. Identity could not be verified.";

export const FACE_PROFILE_NOT_CONFIGURED_MESSAGE = "Face profile not configured by administrator.";

export interface AuthSession {
  token: string;
  companyId: string;
  companyName: string;
  username: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) return {};

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

export function persistAuthSession(loginPayload: unknown, username: string): AuthSession {
  const body =
    loginPayload && typeof loginPayload === "object"
      ? (loginPayload as Record<string, unknown>)
      : {};

  const nestedUser =
    body.user && typeof body.user === "object" ? (body.user as Record<string, unknown>) : {};

  const token = readString(body.token, body.access_token, body.accessToken, body.jwt);

  const jwt = token ? decodeJwtPayload(token) : {};

  const companyId = readString(
    body.company_id,
    body.companyId,
    body.tenant_id,
    body.tenantId,
    body.tenant,
    nestedUser.company_id,
    nestedUser.companyId,
    nestedUser.tenant_id,
    jwt.company_id,
    jwt.companyId,
    jwt.tenant_id,
    jwt.tenantId,
    jwt.tenant,
    jwt.sub,
  );

  const companyName = readString(
    body.company_name,
    body.companyName,
    nestedUser.company_name,
    nestedUser.companyName,
    jwt.company_name,
    jwt.companyName,
    companyId,
  );

  const session: AuthSession = {
    token: token || "local",
    companyId: companyId || "default",
    companyName: companyName || companyId || "default",
    username: readString(body.username, nestedUser.username, username) || username,
  };

  if (!canUseWebStorage()) {
    return session;
  }

  localStorage.setItem(AUTH_STORAGE_KEYS.token, session.token);
  localStorage.setItem(AUTH_STORAGE_KEYS.companyId, session.companyId);
  localStorage.setItem(AUTH_STORAGE_KEYS.companyName, session.companyName);
  localStorage.setItem(AUTH_STORAGE_KEYS.user, session.username);
  localStorage.setItem(AUTH_STORAGE_KEYS.legacyCompanyName, session.companyName);

  return session;
}

export function loadAuthSession(): AuthSession | null {
  if (!canUseWebStorage()) return null;

  const token = localStorage.getItem(AUTH_STORAGE_KEYS.token);
  if (!token) return null;

  const companyId =
    localStorage.getItem(AUTH_STORAGE_KEYS.companyId) ||
    localStorage.getItem(AUTH_STORAGE_KEYS.legacyCompanyName) ||
    "default";

  const companyName =
    localStorage.getItem(AUTH_STORAGE_KEYS.companyName) ||
    localStorage.getItem(AUTH_STORAGE_KEYS.legacyCompanyName) ||
    companyId;

  return {
    token,
    companyId,
    companyName,
    username: localStorage.getItem(AUTH_STORAGE_KEYS.user) || "User",
  };
}

export function clearAuthSession(): void {
  if (!canUseWebStorage()) return;

  Object.values(AUTH_STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });
  sessionStorage.removeItem(FACE_VERIFIED_KEY);
  clearWorkspaceClientState();
}

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
  sources?: unknown[];
}

export async function fetchChatHistory({
  token,
  planMode = "premium",
}: {
  token: string;
  planMode?: PlanMode;
}): Promise<{ company_id: string; messages: ChatHistoryMessage[] }> {
  const headers = await buildClientHeaders({ token, planMode });
  const res = await fetch(buildApiUrl("/api/chat/history"), { headers });
  const body = (await res.json().catch(() => ({}))) as {
    company_id?: string;
    messages?: ChatHistoryMessage[];
    error?: string;
  };

  if (!res.ok) {
    throw new Error(body.error || `Failed to load chat history (${res.status})`);
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  return {
    company_id: String(body.company_id || ""),
    messages,
  };
}

export function setFaceVerifiedForToken(token: string): void {
  if (!canUseWebStorage()) return;

  if (token) {
    sessionStorage.setItem(FACE_VERIFIED_KEY, token);
  }
}

export function isFaceVerifiedForCurrentSession(): boolean {
  if (!canUseWebStorage()) return false;

  const token = localStorage.getItem(AUTH_STORAGE_KEYS.token);
  const verified = sessionStorage.getItem(FACE_VERIFIED_KEY);
  return Boolean(token && verified && verified === token);
}

export async function verifyFaceSnapshot(imageBase64: string): Promise<{
  success: boolean;
  match_score?: number;
  enrolled?: boolean;
}> {
  if (!canUseWebStorage()) {
    throw new Error("Not authenticated.");
  }

  const token = localStorage.getItem(AUTH_STORAGE_KEYS.token);
  if (!token) {
    throw new Error("Not authenticated.");
  }

  const headers = await buildClientHeaders({
    token,
    planMode: loadPlanMode(),
    contentType: "application/json",
  });
  const res = await fetch(buildApiUrl("/api/auth/verify-face"), {
    method: "POST",
    headers,
    body: JSON.stringify({ image: imageBase64 }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    message?: string;
    match_score?: number;
    enrolled?: boolean;
  };

  if (!res.ok || !payload.success) {
    const err = new Error(payload.message || FACE_VERIFY_FAILED_MESSAGE);
    (err as Error & { code?: string }).code = payload.error || "FACE_VERIFICATION_FAILED";
    throw err;
  }

  return {
    success: true,
    match_score: payload.match_score,
    enrolled: payload.enrolled,
  };
}

export interface DocumentRecord {
  id: string;
  filename: string;
  uploadedAt: string;
  folderId?: string | null;
}

export interface FolderRecord {
  id: string;
  name: string;
  createdAt: string;
}

export async function fetchFolders(token: string): Promise<FolderRecord[]> {
  const headers = await buildClientHeaders({ token, planMode: loadPlanMode() });
  const res = await fetch(FOLDERS_API, {
    headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : `Failed to load folders (${res.status})`,
    );
  }
  const list = Array.isArray(body.folders) ? body.folders : [];
  return list.map((item: Record<string, unknown>) => ({
    id: String(item.id),
    name: String(item.name ?? "Untitled folder"),
    createdAt: String(item.created_at ?? item.createdAt ?? new Date().toISOString()),
  }));
}

export async function createFolder(token: string, name: string): Promise<FolderRecord> {
  const headers = await buildClientHeaders({
    token,
    planMode: loadPlanMode(),
    contentType: "application/json",
  });
  const res = await fetch(FOLDERS_API, {
    method: "POST",
    headers,
    body: JSON.stringify({ name }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : `Failed to create folder (${res.status})`,
    );
  }
  const folder = body.folder as Record<string, unknown>;
  return {
    id: String(folder.id),
    name: String(folder.name),
    createdAt: String(folder.created_at ?? new Date().toISOString()),
  };
}

export function buildDocumentsUrl(folderId: string | null): string {
  const base = buildApiUrl("/api/documents");
  if (!folderId) return base;
  return `${base}?folder_id=${encodeURIComponent(folderId)}`;
}

export async function moveDocumentToFolder(
  token: string,
  documentId: string,
  folderId: string | null,
): Promise<void> {
  const headers = await buildClientHeaders({
    token,
    planMode: loadPlanMode(),
    contentType: "application/json",
  });
  const res = await fetch(`${DOCUMENTS_API}/${encodeURIComponent(documentId)}/move`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ folder_id: folderId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : `Failed to move document (${res.status})`,
    );
  }
}

export function normalizeDocuments(payload: unknown): DocumentRecord[] {
  if (Array.isArray(payload)) {
    return mapDocumentRecords(payload);
  }

  const data =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;

  const fromDocuments = data?.documents;
  const fromFiles = data?.files;
  const docs =
    (Array.isArray(fromDocuments) && fromDocuments.length > 0
      ? fromDocuments
      : null) ??
    (Array.isArray(fromFiles) ? fromFiles : null) ??
    [];

  const items = Array.isArray(docs) ? docs : [];
  if (!items.length) return [];

  return mapDocumentRecords(items);
}

function mapDocumentRecords(items: unknown[]): DocumentRecord[] {
  return items
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const doc = item as Record<string, unknown>;
      const id = doc.id ?? doc._id ?? doc.document_id;
      const filename = doc.filename ?? doc.file_name ?? doc.name;
      const uploadedAt = doc.uploadedAt ?? doc.uploaded_at ?? doc.created_at ?? doc.createdAt;

      if (!id && !filename) return null;

      return {
        id: String(id ?? index),
        filename: String(filename ?? "Untitled document"),
        uploadedAt: String(uploadedAt ?? new Date().toISOString()),
        folderId:
          doc.folder_id != null
            ? String(doc.folder_id)
            : doc.folderId != null
              ? String(doc.folderId)
              : null,
      };
    })
    .filter((doc): doc is DocumentRecord => doc !== null);
}

export function formatDocumentDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function isBackendUnreachableError(err: unknown): boolean {
  return err instanceof TypeError;
}

const MIDDLEWARE_NEXT_ERROR = /next is not a function/i;

export function isMiddlewareNextError(message: string): boolean {
  return MIDDLEWARE_NEXT_ERROR.test(message);
}

export function formatKnowledgeBaseLoadError(err: unknown): string {
  if (isBackendUnreachableError(err)) {
    return "Cannot reach the document API. Check your backend connection.";
  }
  if (err instanceof Error) {
    if (MIDDLEWARE_NEXT_ERROR.test(err.message)) {
      return "Could not load documents. Please refresh the page.";
    }
    if (err.message.trim()) return err.message;
  }
  return "Failed to load documents.";
}

export function extractStreamContent(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const payload = parsed as Record<string, unknown>;

  const choices = payload.choices as Array<{ delta?: { content?: string } }> | undefined;
  if (choices?.[0]?.delta?.content) return choices[0].delta.content;

  const message = payload.message as { content?: string } | undefined;
  if (message?.content) return message.content;

  if (typeof payload.response === "string") return payload.response;
  if (typeof payload.content === "string") return payload.content;
  if (typeof payload.reply === "string") return payload.reply;
  if (typeof payload.text === "string") return payload.text;

  return null;
}

export function extractResponseContent(parsed: unknown): string | null {
  const streamed = extractStreamContent(parsed);
  if (streamed) return streamed;

  if (!parsed || typeof parsed !== "object") return null;
  const payload = parsed as Record<string, unknown>;
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.answer === "string") return payload.answer;

  return null;
}
