import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  GripVertical,
  Menu,
  MessageSquare,
  Trash2,
  LogOut,
  Send,
  Upload,
  X,
} from "lucide-react";
import { useKnowledgeBaseDragDrop } from "../hooks/useKnowledgeBaseDragDrop";
import { NewFolderModal } from "../components/NewFolderModal";
import { AssistantMessage } from "../components/AssistantMessage";
import { ChatMessageActions } from "../components/ChatMessageActions";
import { UploadProgressCard } from "../components/UploadProgressCard";
import {
  API_BASE,
  BACKEND_UNREACHABLE_MESSAGE,
  DOCUMENTS_API,
  type AuthSession,
  buildClientHeaders,
  clearAuthSession,
  clearWorkspaceClientState,
  fetchChatHistory,
  buildDocumentsUrl,
  createFolder,
  fetchWithRetry,
  type DocumentRecord,
  extractResponseContent,
  fetchFolders,
  type FolderRecord,
  moveDocumentToFolder,
  FOLDER_EMPTY_MESSAGE,
  extractStreamContent,
  formatDocumentDate,
  isBackendUnreachableError,
  isFaceVerifiedForCurrentSession,
  loadAuthSession,
  normalizeDocuments,
  type PlanMode,
  loadPlanMode,
  fetchTrialStatus,
  fetchStorageQuotaSnapshot,
  fetchQuestionUsageSnapshot,
  getStorageQuotaExceededMessage,
  resolveUploadErrorMessage,
  QUESTION_QUOTA_EXCEEDED_MESSAGE,
  TRIAL_LIMIT_MESSAGE,
  wouldExceedStorageQuota,
  type QuestionUsageSnapshot,
} from "../lib/api";
import {
  getWorkspaceUserIdFromToken,
  registerBackgroundUploadServiceWorker,
  resumePendingUploads,
  uploadDocumentInBackground,
} from "../lib/backgroundUpload";
import {
  parseAssistantMessage,
  stripCitationNoise,
  type ChatSourceRef,
} from "../lib/chatCitations";
import {
  parseChatStreamPayload,
  extractTokenFromChatPayload,
} from "../lib/chatStream";
import {
  type AppLocale,
  detectLocaleFromText,
  isRtlLocale,
  resolveAppLocale,
  setStoredLocale,
} from "../lib/locale";
import { type UploadProgressState } from "../lib/upload-sse";
import {
  buildChatStorageScopeKey,
  DEFAULT_WELCOME_MESSAGE,
  loadChatMessagesForScope,
  saveChatMessagesForScope,
  type StoredChatMessage,
} from "../lib/chatSessionStorage";
import { getDeviceFingerprint } from "../lib/deviceFingerprint";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
  ssr: false,
});

interface ChatMessage extends StoredChatMessage {
  sources?: ChatSourceRef[];
}

type Tab = "chat" | "knowledge";

function ChatPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([DEFAULT_WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderCreating, setFolderCreating] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsUploading, setDocsUploading] = useState(false);
  const [docsError, setDocsError] = useState("");
  const [uploadProgress, setUploadProgress] =
    useState<UploadProgressState | null>(null);
  const [uploadingFilename, setUploadingFilename] = useState<string | null>(
    null,
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUploadIdRef = useRef<string | null>(null);
  const chatScopeKeyRef = useRef<string | null>(null);

  const [auth, setAuth] = useState<AuthSession | null>(null);
  const [locale, setLocale] = useState<AppLocale>("en");
  const [planMode] = useState<PlanMode>(loadPlanMode());
  const [trialStatus, setTrialStatus] = useState<{
    remaining_requests: number;
    request_limit: number;
    storage_used_bytes: number;
    storage_limit_bytes: number;
  } | null>(null);
  const [questionUsage, setQuestionUsage] = useState<QuestionUsageSnapshot | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const safeDocs = Array.isArray(docs) ? docs : [];
  const safeFolders = Array.isArray(folders) ? folders : [];

  const token = auth?.token ?? null;
  const companyId = auth?.companyId ?? "default";
  const companyLabel = planMode === "free_trial" ? "Free Trial" : auth?.companyName ?? companyId;

  const showStorageQuotaToast = useCallback(() => {
    toast.error(getStorageQuotaExceededMessage(locale), { duration: 6000 });
  }, [locale]);

  const showUploadErrorToast = useCallback(
    (err: unknown) => {
      toast.error(resolveUploadErrorMessage(err, locale), { duration: 6000 });
    },
    [locale],
  );

  useEffect(() => {
    const session = loadAuthSession();
    if (!session?.token) {
      navigate({ to: "/" });
      return;
    }
    if (loadPlanMode() !== "free_trial" && !isFaceVerifiedForCurrentSession()) {
      navigate({ to: "/verify-face" });
      return;
    }
    void (async () => {
      if (loadPlanMode() === "free_trial") {
        await getDeviceFingerprint();
      }
      setAuth(session);
      const initialLocale = resolveAppLocale();
      setLocale(initialLocale);
      setStoredLocale(initialLocale);
    })();
  }, [navigate]);

  useEffect(() => {
    if (!auth?.token) return;

    const scopeKey = buildChatStorageScopeKey(auth, planMode);
    if (chatScopeKeyRef.current === scopeKey) return;
    chatScopeKeyRef.current = scopeKey;

    setDocs([]);
    setFolders([]);
    setCurrentFolderId(null);
    setDocsError("");
    setMessages([DEFAULT_WELCOME_MESSAGE]);

    void (async () => {
      try {
        const history = await fetchChatHistory({ token: auth.token, planMode });
        const apiMessages = history.messages
          .filter(
            (m) =>
              (m.role === "user" || m.role === "assistant") &&
              String(m.content || "").trim().length > 0,
          )
          .map((m) => ({
            role: m.role,
            content: m.content,
            sources: Array.isArray(m.sources) ? (m.sources as ChatSourceRef[]) : [],
          }));

        if (apiMessages.length > 0) {
          setMessages(apiMessages);
          saveChatMessagesForScope(scopeKey, apiMessages);
          return;
        }
      } catch (err) {
        console.warn("[Chat] server history load failed — using scoped cache:", err);
      }

      setMessages(loadChatMessagesForScope(scopeKey));
    })();
  }, [auth?.token, auth?.companyId, planMode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!auth?.token || !chatScopeKeyRef.current) return;
    saveChatMessagesForScope(chatScopeKeyRef.current, messages);
  }, [messages, auth?.token]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen]);

  const currentFolder = currentFolderId
    ? safeFolders.find((folder) => folder.id === currentFolderId) ?? null
    : null;

  const fetchFoldersList = async () => {
    if (!token || planMode === "free_trial") {
      setFolders([]);
      return;
    }
    try {
      const list = await fetchFolders(token);
      setFolders(Array.isArray(list) ? list : []);
    } catch (err) {
      console.warn("[KB] folders load failed:", err);
      setFolders([]);
    }
  };

  const fetchDocs = async (folderId: string | null = currentFolderId) => {
    setDocsLoading(true);
    if (!token) {
      setDocs([]);
      setDocsLoading(false);
      return;
    }
    try {
      let headers: Record<string, string>;
      try {
        headers = await buildClientHeaders({ token, planMode });
      } catch (headerErr) {
        console.warn("[KB] client headers failed:", headerErr);
        return;
      }

      const res = await fetchWithRetry(buildDocumentsUrl(folderId), {
        headers,
      });
      const data = await res.json().catch(() => ({}));
      const normalized = normalizeDocuments(data);

      if (res.ok) {
        setDocs(normalized);
        return;
      }

      console.warn("[KB] documents request failed:", res.status, data);
      if (normalized.length > 0) {
        setDocs(normalized);
      }
    } catch (err) {
      console.warn("[KB] documents load failed:", err);
    } finally {
      setDocsLoading(false);
    }
  };

  const refreshKnowledgeBase = async (folderId: string | null = currentFolderId) => {
    try {
      await Promise.all([fetchFoldersList(), fetchDocs(folderId)]);
    } catch (err) {
      console.warn("[KB] refresh failed:", err);
    }
  };

  useEffect(() => {
    registerBackgroundUploadServiceWorker();
  }, []);

  useEffect(() => {
    if (!token) return;
    void refreshKnowledgeBase(currentFolderId);
  }, [token, currentFolderId, planMode]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const status = await fetchTrialStatus({ token, planMode });
        const trial = status?.trial;
        if (!trial || typeof trial !== "object") {
          setTrialStatus(null);
          return;
        }
        setTrialStatus({
          remaining_requests: Number(trial.remaining_requests) || 0,
          request_limit: Number(trial.request_limit) || 5,
          storage_used_bytes: Number(trial.storage_used_bytes) || 0,
          storage_limit_bytes: Number(trial.storage_limit_bytes) || 5 * 1024 * 1024,
        });
      } catch (err) {
        console.warn("[KB] trial status load failed:", err);
        setTrialStatus(null);
      }
    })();
  }, [token, planMode, docsUploading, isLoading]);

  useEffect(() => {
    if (!token || planMode === "free_trial") {
      setQuestionUsage(null);
      return;
    }
    void (async () => {
      const usage = await fetchQuestionUsageSnapshot({ token, planMode });
      setQuestionUsage(usage);
    })();
  }, [token, planMode, isLoading]);

  useEffect(() => {
    if (!token || !companyId || docsUploading) return;

    const workspaceUserId = getWorkspaceUserIdFromToken(token);

    void resumePendingUploads(token, companyId, {
      userId: workspaceUserId,
      activeUploadId: activeUploadIdRef.current,
      onProgress: (_uploadId, progress) => {
        setDocsUploading(true);
        setUploadProgress(progress);
      },
      onComplete: (_uploadId, status) => {
        setDocsUploading(false);
        activeUploadIdRef.current = null;
        setUploadProgress({
          percent: 100,
          phase: status.message || status.result?.message || "Document ready",
          current: 0,
          total: 0,
        });
        void refreshKnowledgeBase(currentFolderId);
        window.setTimeout(() => setUploadProgress(null), 2000);
      },
      onError: (_uploadId, err) => {
        setDocsUploading(false);
        activeUploadIdRef.current = null;
        setUploadProgress(null);
        showUploadErrorToast(err);
      },
    });

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "PRIVA_RESUME_UPLOADS" && token && !docsUploading) {
        void resumePendingUploads(token, companyId, {
          userId: workspaceUserId,
          activeUploadId: activeUploadIdRef.current,
          onComplete: () => void refreshKnowledgeBase(currentFolderId),
        });
      }
    };

    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onSwMessage);
  }, [token, companyId, docsUploading]);

  const patchAssistantMessage = (
    patch: Partial<ChatMessage> & { content?: string },
  ) => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === "assistant") {
        next[next.length - 1] = { ...last, ...patch };
        return next;
      }
      return [...prev, { role: "assistant", content: patch.content || "" }];
    });
  };

  const setAssistantContent = (
    content: string,
    sources?: ChatSourceRef[],
  ) => {
    patchAssistantMessage({ content, sources });
  };

  const showAssistantError = (content: string) => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === "assistant" && !last.content) {
        next[next.length - 1] = { ...last, content };
        return next;
      }
      return [...prev, { role: "assistant", content }];
    });
  };

  const appendStreamContent = (piece: string, assistantText: string) => {
    const nextText = assistantText + piece;
    setAssistantContent(nextText);
    return nextText;
  };

  const processStreamLine = (
    line: string,
    assistantText: string,
    sources: ChatSourceRef[],
    sourceFilenames: string[] = [],
  ): {
    text: string;
    sources: ChatSourceRef[];
    sourceFilenames: string[];
  } => {
    const trimmed = line.trim();
    if (!trimmed) {
      return { text: assistantText, sources, sourceFilenames };
    }

    const payload = trimmed.startsWith("data: ")
      ? trimmed.slice(6).trim()
      : trimmed;
    if (!payload || payload === "[DONE]") {
      return { text: assistantText, sources, sourceFilenames };
    }

    const event = parseChatStreamPayload(payload);
    if (!event) {
      return { text: assistantText, sources, sourceFilenames };
    }

    if (event.type === "sources" && Array.isArray(event.sources)) {
      const names = Array.isArray(event.source_filenames)
        ? event.source_filenames
        : sourceFilenames;
      return {
        text: assistantText,
        sources: event.sources,
        sourceFilenames: names,
      };
    }

    if (event.type === "token" && event.text) {
      const piece = stripCitationNoise(event.text);
      return {
        text: appendStreamContent(piece, assistantText),
        sources,
        sourceFilenames,
      };
    }

    if (event.type === "done") {
      const finalText =
        typeof event.answer === "string" ? event.answer : assistantText;
      const mergedSources = Array.isArray(event.sources)
        ? event.sources
        : sources;
      const mergedFilenames = Array.isArray(event.source_filenames)
        ? event.source_filenames
        : sourceFilenames;
      return {
        text: finalText,
        sources: mergedSources,
        sourceFilenames: mergedFilenames,
      };
    }

    if (event.type === "error") {
      throw new Error(event.message || "Chat stream failed.");
    }

    const legacyToken = extractTokenFromChatPayload(event);
    if (legacyToken) {
      return {
        text: appendStreamContent(stripCitationNoise(legacyToken), assistantText),
        sources,
        sourceFilenames,
      };
    }

    return { text: assistantText, sources, sourceFilenames };
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input.trim();
    setInput("");
    const activeLocale = detectLocaleFromText(userMsg);
    setLocale(activeLocale);
    setStoredLocale(activeLocale);
    const historyForApi = messages
      .filter(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          m.content.trim().length > 0,
      )
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "", sources: [] }]);

    try {
      const res = await fetchWithRetry(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: await buildClientHeaders({
          token,
          planMode,
          contentType: "application/json",
          accept: "text/event-stream",
        }),
        body: JSON.stringify({
          message: userMsg,
          company_id: companyId,
          ...(currentFolderId ? { folder_id: currentFolderId } : {}),
          history: historyForApi,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        let detail = `Request failed (${res.status})`;
        let code = "";
        try {
          const parsed = JSON.parse(errBody) as { message?: string; error?: string; code?: string };
          detail = parsed.message || parsed.error || detail;
          code = parsed.code || parsed.error || "";
        } catch {
          if (errBody) detail = errBody;
        }
        if (code === "TRIAL_LIMIT_REACHED") {
          detail = TRIAL_LIMIT_MESSAGE;
        }
        if (code === "QUESTION_QUOTA_EXCEEDED") {
          detail = QUESTION_QUOTA_EXCEEDED_MESSAGE;
        }
        showAssistantError(detail);
        try {
          if (planMode === "free_trial") {
            const status = await fetchTrialStatus({ token, planMode });
            setTrialStatus(status.trial);
          } else {
            const usage = await fetchQuestionUsageSnapshot({ token, planMode });
            setQuestionUsage(usage);
          }
        } catch {
          /* ignore */
        }
        return;
      }

      const contentType = res.headers.get("content-type") ?? "";
      const reader = res.body?.getReader();

      if (!reader) {
        const body = contentType.includes("application/json")
          ? await res.json()
          : await res.text();
        const text =
          typeof body === "string"
            ? body
            : extractResponseContent(body) ?? JSON.stringify(body);
        const parsed = parseAssistantMessage(text);
        setAssistantContent(parsed.answer);
        return;
      }

      const decoder = new TextDecoder();
      let assistantText = "";
      let streamSources: ChatSourceRef[] = [];
      let streamFilenames: string[] = [];
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const result = processStreamLine(
            line,
            assistantText,
            streamSources,
            streamFilenames,
          );
          assistantText = result.text;
          streamSources = result.sources;
          streamFilenames = result.sourceFilenames;
          setAssistantContent(assistantText, streamSources);
        }
      }

      if (buffer.trim()) {
        const result = processStreamLine(
          buffer,
          assistantText,
          streamSources,
          streamFilenames,
        );
        assistantText = result.text;
        streamSources = result.sources;
        streamFilenames = result.sourceFilenames;
      }

      const parsed = parseAssistantMessage(
        assistantText,
        streamSources,
        streamFilenames,
      );
      setAssistantContent(parsed.answer, streamSources);

      if (!parsed.answer.trim()) {
        setAssistantContent(
          "The backend responded but returned no message content. Check the API response format.",
        );
      }

      if (planMode !== "free_trial") {
        const usage = await fetchQuestionUsageSnapshot({ token, planMode });
        setQuestionUsage(usage);
      }
    } catch (err) {
      const message = isBackendUnreachableError(err)
        ? BACKEND_UNREACHABLE_MESSAGE
        : err instanceof Error
          ? err.message
          : "Something went wrong while waiting for the assistant response.";
      showAssistantError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || docsUploading || !token) return;

    const quota = await fetchStorageQuotaSnapshot({
      token,
      planMode,
      cached: trialStatus
        ? {
            usedBytes: trialStatus.storage_used_bytes,
            limitBytes: trialStatus.storage_limit_bytes,
          }
        : null,
    });

    if (
      quota &&
      wouldExceedStorageQuota(quota.usedBytes, quota.limitBytes, file.size)
    ) {
      showStorageQuotaToast();
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setDocsUploading(true);
    setDocsError("");
    setUploadingFilename(file.name);
    setUploadProgress({
      percent: 0,
      phase: "Starting background upload…",
      current: 0,
      total: 0,
    });

    try {
      const workspaceUserId = getWorkspaceUserIdFromToken(token);
      console.log("[UPLOAD] starting background upload", file.name);

      await uploadDocumentInBackground(file, {
        token,
        companyId,
        userId: workspaceUserId,
        folderId: currentFolderId,
        onProgress: (progress) => {
          console.log("[UPLOAD] progress", progress.percent, progress.phase);
          setUploadProgress(progress);
        },
        onAccepted: (accepted) => {
          const id = accepted.upload_id || accepted.job_id || null;
          activeUploadIdRef.current = id;
          console.log("[UPLOAD] accepted, poll should start", id);
          setUploadProgress((prev) => ({
            percent: prev?.percent ?? 2,
            phase: "Processing on server — checking status…",
            current: prev?.current ?? 0,
            total: prev?.total ?? 0,
          }));
        },
        onComplete: async (status) => {
          activeUploadIdRef.current = null;
          setUploadProgress({
            percent: 100,
            phase: status.message || "Upload complete",
            current: 0,
            total: 0,
          });
          await refreshKnowledgeBase(currentFolderId);
          window.setTimeout(() => setUploadProgress(null), 2000);
        },
      });
    } catch (err) {
      activeUploadIdRef.current = null;
      setUploadProgress(null);
      showUploadErrorToast(err);
    } finally {
      activeUploadIdRef.current = null;
      setDocsUploading(false);
      setUploadingFilename(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCreateFolder = async (name: string) => {
    if (!token) return;
    setFolderCreating(true);
    try {
      await createFolder(token, name);
      await fetchFoldersList();
    } finally {
      setFolderCreating(false);
    }
  };

  const openFolder = (folderId: string) => {
    setCurrentFolderId(folderId);
    setDocsError("");
  };

  const exitFolder = () => {
    setCurrentFolderId(null);
    setDocsError("");
  };

  const handleMoveDocument = useCallback(
    async (documentId: string, folderId: string | null) => {
      if (!token) return;
      setDocsError("");
      try {
        await moveDocumentToFolder(token, documentId, folderId);
        await fetchDocs(currentFolderId);
      } catch (err) {
        setDocsError(
          isBackendUnreachableError(err)
            ? BACKEND_UNREACHABLE_MESSAGE
            : err instanceof Error
              ? err.message
              : "Failed to move document.",
        );
      }
    },
    [token, currentFolderId],
  );

  const {
    ROOT_DROP_ID,
    draggingDocId,
    movingDocId,
    dropHighlightClass,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDropOnTarget,
    handleTouchStart,
  } = useKnowledgeBaseDragDrop({
    onMove: handleMoveDocument,
    allowRootDrop: Boolean(currentFolderId),
  });

  const handleDeleteDoc = async (id: string) => {
    setDocsError("");
    try {
      const res = await fetchWithRetry(`${DOCUMENTS_API}/${id}`, {
        method: "DELETE",
        headers: await buildClientHeaders({ token, planMode }),
      });
      if (res.ok) {
        setDocs((prev) => prev.filter((doc) => doc.id !== id));
      } else {
        setDocsError(`Delete failed (${res.status}).`);
      }
    } catch (err) {
      setDocsError(
        isBackendUnreachableError(err) ? BACKEND_UNREACHABLE_MESSAGE : "Delete failed. Please try again.",
      );
    }
  };

  const handleReset = () => {
    if (chatScopeKeyRef.current) {
      saveChatMessagesForScope(chatScopeKeyRef.current, [DEFAULT_WELCOME_MESSAGE]);
    }
    setMessages([DEFAULT_WELCOME_MESSAGE]);
  };

  const handleLogout = () => {
    clearAuthSession();
    clearWorkspaceClientState();
    chatScopeKeyRef.current = null;
    setAuth(null);
    setMessages([DEFAULT_WELCOME_MESSAGE]);
    setDocs([]);
    setFolders([]);
    setCurrentFolderId(null);
    setDocsError("");
    setInput("");
    setTrialStatus(null);
    setQuestionUsage(null);
    setMobileNavOpen(false);
    navigate({ to: "/" });
  };

  const handleNavTab = (tab: Tab) => {
    setActiveTab(tab);
    setMobileNavOpen(false);
  };

  if (!auth) {
    return null;
  }

  const contentDir = isRtlLocale(locale) ? "rtl" : "ltr";

  const sidebarContent = (
    <>
      <div className="shrink-0 p-4 lg:p-6">
        <h2 className="text-lg font-bold text-white">AI Workspace</h2>
        <p className="mt-1 text-xs text-[#A3B8B0]">
          Active Company:{" "}
          <span className="text-[#00E699]">{companyLabel}</span>
        </p>
        {planMode === "free_trial" && trialStatus ? (
          <div className="mt-3 rounded-lg border border-[#00E699]/20 bg-[#041C15]/45 p-2">
            <p className="text-[10px] text-[#A3B8B0]">
              Plan: <span className="font-semibold text-white">Free Trial</span> |{" "}
              {trialStatus.remaining_requests}/{trialStatus.request_limit} Questions Left
            </p>
            <p className="mt-1 text-[10px] text-[#A3B8B0]">
              Storage: {(trialStatus.storage_used_bytes / (1024 * 1024)).toFixed(1)}MB/
              {(trialStatus.storage_limit_bytes / (1024 * 1024)).toFixed(1)}MB
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-[#0D3127]">
              <div
                className="h-full rounded bg-[#00E699]"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      0,
                      (trialStatus.storage_used_bytes / Math.max(1, trialStatus.storage_limit_bytes)) *
                        100,
                    ),
                  )}%`,
                }}
              />
            </div>
          </div>
        ) : null}
        {planMode !== "free_trial" && questionUsage ? (
          <div className="mt-3 rounded-lg border border-[#00E699]/20 bg-[#041C15]/45 p-2">
            <p className="text-[10px] text-[#A3B8B0]">
              Questions: {questionUsage.used} / {questionUsage.limit} Used
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-[#0D3127]">
              <div
                className="h-full rounded bg-[#00E699]"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(0, (questionUsage.used / Math.max(1, questionUsage.limit)) * 100),
                  )}%`,
                }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-2">
        <button
          type="button"
          onClick={() => handleNavTab("knowledge")}
          className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
            activeTab === "knowledge"
              ? "bg-[#054232] text-white shadow-[0_0_12px_rgba(5,66,50,0.5)]"
              : "bg-[#041C15]/50 text-[#A3B8B0] hover:bg-[#054232]/30"
          }`}
        >
          <FolderOpen size={18} />
          KNOWLEDGE BASE
        </button>
        <button
          type="button"
          onClick={() => handleNavTab("chat")}
          className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
            activeTab === "chat"
              ? "bg-[#054232] text-white shadow-[0_0_12px_rgba(5,66,50,0.5)]"
              : "bg-[#041C15]/50 text-[#A3B8B0] hover:bg-[#054232]/30"
          }`}
        >
          <MessageSquare size={18} />
          PRIVA AI CHAT
        </button>
      </div>

      <div className="shrink-0 p-4">
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#041C15]/60 px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#A3B8B0] transition-all hover:bg-red-900/20 hover:text-red-400"
        >
          <LogOut size={16} />
          LOGOUT
        </button>
      </div>
    </>
  );

  return (
    <div className="relative h-screen max-h-screen h-dvh max-h-dvh min-h-0 w-full overflow-hidden">
      {/* Background video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      >
        <source src="/videos/bg_video.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-gradient-to-b from-[#041C15]/85 via-[#0B2B22]/75 to-[#041C15]/90" />

      {/* App shell: stacks on mobile, side-by-side on desktop */}
      <div
        className="relative z-10 flex h-full max-h-full w-full min-w-0 flex-col overflow-hidden lg:flex-row"
        dir="ltr"
      >
        {mobileNavOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            aria-label="Close navigation menu"
            onClick={() => setMobileNavOpen(false)}
          />
        ) : null}

        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-[min(100vw-3rem,20rem)] max-w-full flex-col border-r border-[#00E699]/10 backdrop-blur-md transition-transform duration-300 ease-in-out lg:hidden ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ background: "rgba(4, 28, 21, 0.95)" }}
          aria-hidden={!mobileNavOpen}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[#00E699]/10 px-4 py-3">
            <p className="text-sm font-semibold text-white">Navigation</p>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#00E699]/20 bg-[#041C15]/60 text-white"
              aria-label="Close navigation menu"
            >
              <X size={18} />
            </button>
          </div>
          {sidebarContent}
        </aside>

        <aside
          className="relative z-10 hidden h-full max-h-full min-h-0 w-64 shrink-0 flex-col border-r border-[#00E699]/10 backdrop-blur-md lg:flex xl:w-72"
          style={{ background: "rgba(4, 28, 21, 0.55)" }}
        >
          {sidebarContent}
        </aside>

      {/* Main workspace — RTL/LTR for text only; scroll contained here */}
      <main
        className="relative z-10 flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
        dir={contentDir}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-[#00E699]/10 px-4 py-3 backdrop-blur-sm lg:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#00E699]/20 bg-[#041C15]/60 text-white"
            aria-label="Open navigation menu"
            aria-expanded={mobileNavOpen}
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {activeTab === "chat" ? "PRIVA AI Chat" : "Knowledge Base"}
            </p>
            <p className="truncate text-xs text-[#A3B8B0]">{companyLabel}</p>
          </div>
        </div>
        {activeTab === "chat" ? (
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            {/* Chat header */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#00E699]/10 px-4 py-3 backdrop-blur-sm sm:px-6 sm:py-4">
              <h3 className="text-sm font-semibold text-white sm:text-base">
                PRIVA AI Chat
              </h3>
              <button
                type="button"
                onClick={handleReset}
                className="flex min-h-[40px] items-center gap-2 rounded-lg bg-[#041C15]/60 px-3 py-2 text-xs font-medium text-[#A3B8B0] transition-all hover:bg-[#00E699]/10 hover:text-[#00E699]"
              >
                <Trash2 size={14} />
                <span className="hidden sm:inline">Reset Discussion</span>
                <span className="sm:hidden">Reset</span>
              </button>
            </div>

            {/* Messages feed — only this region scrolls vertically */}
            <div
              className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-4 sm:p-6"
              dir={contentDir}
            >
              {messages.map((msg, idx) => {
                const isUser = msg.role === "user";
                const isStreamingMsg =
                  isLoading && !isUser && idx === messages.length - 1;
                const assistantParsed = isUser
                  ? null
                  : parseAssistantMessage(
                      msg.content,
                      msg.sources || [],
                    );
                const copyText = isUser
                  ? msg.content
                  : assistantParsed?.answer?.trim() ||
                    stripCitationNoise(msg.content);

                return (
                  <div
                    key={idx}
                    className={`flex w-full ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`flex min-w-0 max-w-[85%] items-start gap-1 sm:max-w-[75%] ${
                        isUser ? "flex-row-reverse" : "flex-row"
                      }`}
                    >
                      <div
                        className={`min-w-0 flex-1 overflow-x-hidden rounded-2xl px-5 py-3 text-sm leading-relaxed ${
                          isUser
                            ? "bg-white text-[#041C15] shadow-lg"
                            : "bg-[#054232]/70 text-white backdrop-blur-sm"
                        }`}
                      >
                        {isUser ? (
                          <div
                            className="whitespace-pre-wrap text-start"
                            dir={contentDir}
                          >
                            {msg.content}
                          </div>
                        ) : (
                          <AssistantMessage
                            content={msg.content}
                            parsed={assistantParsed}
                            locale={locale}
                            isStreaming={isStreamingMsg}
                          />
                        )}
                      </div>
                      <div className="shrink-0 self-start pt-0.5">
                        <ChatMessageActions
                          text={copyText}
                          menuAlign={isUser ? "end" : "start"}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-[#054232]/50 px-5 py-3 text-sm text-[#A3B8B0]">
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#00E699]"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#00E699]"
                        style={{ animationDelay: "200ms" }}
                      />
                      <span
                        className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#00E699]"
                        style={{ animationDelay: "400ms" }}
                      />
                      &nbsp;PRIVA AI is thinking...
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="shrink-0 border-t border-[#00E699]/10 p-3 backdrop-blur-sm sm:p-4">
              {currentFolder ? (
                <p className="mb-2 text-xs text-[#00E699]/90">
                  Chat scoped to folder:{" "}
                  <span className="font-semibold text-white">{currentFolder.name}</span>
                </p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder={
                    currentFolder
                      ? `Ask about files in "${currentFolder.name}"…`
                      : "Ask using your knowledge base…"
                  }
                  className="min-h-[44px] w-full min-w-0 flex-1 rounded-xl border border-[#00E699]/20 bg-[#041C15]/50 px-4 py-3 text-sm text-white placeholder-[#A3B8B0]/50 outline-none transition-all focus:border-[#00E699]/50 focus:ring-1 focus:ring-[#00E699]/30"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-xs font-bold uppercase tracking-wider text-white transition-all hover:brightness-110 disabled:opacity-40 sm:w-auto"
                  style={{
                    background: "#054232",
                    boxShadow: "0 0 12px rgba(5, 66, 50, 0.5)",
                  }}
                >
                  <Send size={16} />
                  SEND
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Knowledge base panel */
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 flex-col gap-3 border-b border-[#00E699]/10 px-4 py-3 backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6 sm:py-4">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-white sm:text-base">
                  Knowledge Base
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-[#A3B8B0]">
                  <button
                    type="button"
                    data-folder-drop-id={ROOT_DROP_ID}
                    onClick={() => {
                      if (draggingDocId || movingDocId) return;
                      exitFolder();
                    }}
                    onDragOver={
                      currentFolderId ? handleDragOver(ROOT_DROP_ID) : undefined
                    }
                    onDragLeave={
                      currentFolderId ? handleDragLeave(ROOT_DROP_ID) : undefined
                    }
                    onDrop={
                      currentFolderId ? handleDropOnTarget(ROOT_DROP_ID) : undefined
                    }
                    className={`rounded px-1 transition-colors hover:text-[#00E699] ${!currentFolderId ? "font-semibold text-white" : ""} ${currentFolderId ? dropHighlightClass(ROOT_DROP_ID) : ""}`}
                    title={
                      currentFolderId
                        ? "Drop here to move document to root"
                        : undefined
                    }
                  >
                    Root
                  </button>
                  {currentFolder ? (
                    <>
                      <ChevronRight size={12} className="opacity-60" />
                      <span className="truncate font-semibold text-white">
                        {currentFolder.name}
                      </span>
                    </>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-[#A3B8B0]">
                  {safeDocs.length} document{safeDocs.length === 1 ? "" : "s"} in this view
                  {!currentFolderId && safeFolders.length > 0
                    ? ` · ${safeFolders.length} folder${safeFolders.length === 1 ? "" : "s"}`
                    : ""}
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  onClick={() => setFolderModalOpen(true)}
                  disabled={docsUploading || Boolean(currentFolderId)}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-[#00E699]/25 px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#00E699] transition-all hover:bg-[#054232]/40 disabled:opacity-40 sm:w-auto"
                  title={currentFolderId ? "Create folders from the root view" : undefined}
                >
                  <Folder size={14} />
                  New Folder
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={docsUploading}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-all hover:brightness-110 disabled:opacity-50 sm:w-auto"
                  style={{
                    background: "#054232",
                    boxShadow: "0 0 12px rgba(5, 66, 50, 0.4)",
                  }}
                >
                  <Upload size={14} />
                  {docsUploading ? "Uploading..." : "Upload Document"}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            {uploadProgress && (
              <UploadProgressCard
                progress={uploadProgress}
                filename={uploadingFilename ?? undefined}
                locale={locale}
              />
            )}

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
              {draggingDocId && !currentFolderId ? (
                <p className="mb-3 rounded-lg border border-[#00E699]/25 bg-[#054232]/30 px-3 py-2 text-xs text-[#00E699]">
                  Drag a file onto a folder to move it.
                </p>
              ) : null}
              {draggingDocId && currentFolderId ? (
                <p className="mb-3 rounded-lg border border-[#00E699]/25 bg-[#054232]/30 px-3 py-2 text-xs text-[#00E699]">
                  Drop on <span className="font-semibold">Root</span> or go back to move
                  into another folder.
                </p>
              ) : null}

              {docsLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-[#A3B8B0]">
                  <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#00E699]/30 border-t-[#00E699]" />
                  Loading documents...
                </div>
              ) : !currentFolderId && safeFolders.length === 0 && safeDocs.length === 0 ? (
                <div
                  className="rounded-2xl border border-dashed border-[#00E699]/20 bg-[#041C15]/40 px-6 py-16 text-center backdrop-blur-sm"
                >
                  <FolderOpen
                    size={32}
                    className="mx-auto mb-3 text-[#00E699]/60"
                  />
                  <p className="text-sm font-medium text-white">
                    No documents yet
                  </p>
                  <p className="mt-1 text-xs text-[#A3B8B0]">
                    Create a folder or upload a file to build your knowledge base.
                  </p>
                </div>
              ) : currentFolderId && safeDocs.length === 0 ? (
                <div
                  className="rounded-2xl border border-dashed border-[#00E699]/20 bg-[#041C15]/40 px-6 py-16 text-center backdrop-blur-sm"
                >
                  <Folder size={32} className="mx-auto mb-3 text-[#00E699]/60" />
                  <p className="text-sm font-medium text-white">
                    This folder is empty
                  </p>
                  <p className="mt-1 text-xs text-[#A3B8B0]">
                    Upload a document here. Chat in this folder will only use files
                    inside it.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {!currentFolderId && safeFolders.length > 0 ? (
                    <div>
                      <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#A3B8B0]">
                        Folders
                      </div>
                      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {safeFolders.map((folder) => (
                          <li
                            key={folder.id}
                            data-folder-drop-id={folder.id}
                            onDragOver={handleDragOver(folder.id)}
                            onDragLeave={handleDragLeave(folder.id)}
                            onDrop={handleDropOnTarget(folder.id)}
                            className={`overflow-hidden rounded-2xl border border-[#00E699]/15 backdrop-blur-md transition-colors ${dropHighlightClass(folder.id)}`}
                            style={{ background: "rgba(4, 28, 21, 0.55)" }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (draggingDocId || movingDocId) return;
                                openFolder(folder.id);
                              }}
                              className="flex min-h-[88px] w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-[#054232]/25"
                            >
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#054232]/60">
                                <Folder size={18} className="text-[#00E699]" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-white">
                                  {folder.name}
                                </p>
                                <p className="mt-0.5 text-xs text-[#A3B8B0]">
                                  {draggingDocId
                                    ? "Drop file here"
                                    : "Open folder"}
                                </p>
                              </div>
                              <ChevronRight size={16} className="shrink-0 text-[#00E699]/70" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {safeDocs.length > 0 ? (
                    <div>
                      <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#A3B8B0]">
                        Documents
                      </div>
                      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {safeDocs.map((doc) => (
                          <li
                            key={doc.id}
                            draggable={!docsUploading && movingDocId !== doc.id}
                            onDragStart={handleDragStart(doc.id)}
                            onDragEnd={handleDragEnd}
                            onTouchStart={handleTouchStart(doc.id)}
                            className={`flex min-h-[120px] flex-col rounded-2xl border border-[#00E699]/15 p-4 backdrop-blur-md transition-colors hover:bg-[#054232]/20 ${
                              draggingDocId === doc.id ? "opacity-50" : ""
                            } ${movingDocId === doc.id ? "pointer-events-none opacity-40" : "cursor-grab active:cursor-grabbing"}`}
                            style={{ background: "rgba(4, 28, 21, 0.55)" }}
                            title="Drag to a folder to move"
                          >
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <span
                                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-[#00E699]/50"
                                aria-hidden
                              >
                                <GripVertical size={14} />
                              </span>
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#054232]/60">
                                <FolderOpen size={16} className="text-[#00E699]" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-sm font-medium text-white">
                                  {doc.filename}
                                </p>
                                <p className="mt-1 text-xs text-[#A3B8B0]">
                                  {formatDocumentDate(doc.uploadedAt)}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 flex justify-end border-t border-[#00E699]/10 pt-3">
                              <button
                                type="button"
                                onClick={() => handleDeleteDoc(doc.id)}
                                onTouchStart={(e) => e.stopPropagation()}
                                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-transparent px-3 py-2 text-base transition-all hover:border-red-500/30 hover:bg-red-900/25"
                                aria-label={`Delete ${doc.filename}`}
                                title="Delete document"
                              >
                                🗑️
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <NewFolderModal
              open={folderModalOpen}
              loading={folderCreating}
              onClose={() => setFolderModalOpen(false)}
              onCreate={handleCreateFolder}
            />
          </div>
        )}
      </main>
      </div>
    </div>
  );
}
