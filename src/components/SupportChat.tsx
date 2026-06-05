import { Loader2, Send, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadAuthSession } from "../lib/api";
import {
  fetchSupportThread,
  mergeSupportThread,
  sendSupportMessage,
  type SupportChatMessage,
} from "../lib/supportChatApi";

const WELCOME_MESSAGE: SupportChatMessage = {
  id: "welcome",
  role: "support",
  content: "Welcome! How can we help you today?",
  timestamp: new Date(0).toISOString(),
};

const THREAD_POLL_MS = 8000;

function resolveSupportUserId(): string {
  const session = loadAuthSession();
  if (session?.username?.trim()) return session.username.trim();
  if (session?.token?.trim()) return session.token.trim();
  return "guest";
}

export default function SupportChat({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<SupportChatMessage[]>([WELCOME_MESSAGE]);
  const [sending, setSending] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sendError, setSendError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadThread = useCallback(async (options?: { silent?: boolean }) => {
    const userId = resolveSupportUserId();
    const session = loadAuthSession();

    if (!options?.silent) {
      setLoadingThread(true);
    }
    try {
      const thread = await fetchSupportThread(userId, session?.token ?? null);
      setMessages(thread.length > 0 ? thread : [WELCOME_MESSAGE]);
      if (!options?.silent) {
        setSendError("");
      }
    } catch (err) {
      console.warn("[SupportChat] thread load failed:", err);
      if (!options?.silent) {
        setSendError(
          err instanceof Error ? err.message : "Could not load support conversation.",
        );
      }
    } finally {
      if (!options?.silent) {
        setLoadingThread(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadThread();
  }, [isOpen, loadThread]);

  useEffect(() => {
    if (!isOpen) return;

    const intervalId = window.setInterval(() => {
      void loadThread({ silent: true });
    }, THREAD_POLL_MS);

    return () => window.clearInterval(intervalId);
  }, [isOpen, loadThread]);

  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setSendError("");

    const timestamp = new Date().toISOString();
    const userId = resolveSupportUserId();
    const session = loadAuthSession();

    const optimisticMessage: SupportChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp,
    };

    try {
      await sendSupportMessage({
        message: trimmed,
        userId,
        timestamp,
        token: session?.token ?? null,
      });

      setInput("");
      setMessages((prev) => mergeSupportThread(prev, [optimisticMessage]));

      // Refresh from Supabase in the background — do not block the send spinner.
      void fetchSupportThread(userId, session?.token ?? null)
        .then((thread) => {
          if (thread.length > 0) {
            setMessages(thread);
          }
        })
        .catch(() => {
          /* keep optimistic message; polling will retry */
        });
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Could not send your message. Please try again.",
      );
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex h-96 w-80 flex-col overflow-hidden rounded-lg border border-green-800 bg-[#0d1512] p-4 text-gray-100 shadow-xl sm:bottom-6 sm:right-6">
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <h3 className="font-bold text-gray-100">Support Chat</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 transition-colors hover:text-white"
          aria-label="Close support chat"
        >
          <X size={18} />
        </button>
      </div>

      <div className="mb-2 min-h-0 flex-1 overflow-y-auto rounded border border-green-800/40 bg-[#132a22] p-2">
        {loadingThread && messages.length <= 1 && !sending ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            Loading conversation…
          </div>
        ) : (
          <ul className="space-y-2">
            {messages.map((msg) => (
              <li
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded px-2.5 py-1.5 text-sm ${
                    msg.role === "user"
                      ? "bg-green-600 text-white"
                      : "border border-green-800/40 bg-[#1a3329] text-gray-100"
                  }`}
                >
                  {msg.content}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div ref={messagesEndRef} />
      </div>

      {sendError ? (
        <p className="mb-2 shrink-0 text-xs text-red-400" role="alert">
          {sendError}
        </p>
      ) : null}

      <form
        className="flex shrink-0 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (sendError) setSendError("");
          }}
          disabled={sending}
          className="min-w-0 flex-1 rounded border border-green-800/50 bg-[#1a3329] p-2 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-green-700/70 focus:ring-1 focus:ring-green-600/30 disabled:opacity-60"
          placeholder="Type a message..."
          aria-label="Support message"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-600 text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={sending ? "Sending message" : "Send message"}
        >
          {sending ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <Send size={16} aria-hidden />
          )}
        </button>
      </form>
    </div>
  );
}
