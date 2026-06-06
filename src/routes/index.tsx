import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Info, X } from "lucide-react";
import { useState } from "react";
import {
  API_BASE,
  buildClientHeaders,
  clearAuthSession,
  clearWorkspaceClientState,
  isBackendUnreachableError,
  persistPlanMode,
  persistAuthSession,
  setFaceVerifiedForToken,
} from "../lib/api";
import { getDeviceFingerprint } from "../lib/deviceFingerprint";

export const Route = createFileRoute("/")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      persistPlanMode("premium");
      clearWorkspaceClientState();
      const res = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: await buildClientHeaders({
          contentType: "application/json",
          planMode: "premium",
        }),
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        const data = await res.json();
        persistAuthSession(data, username);
        navigate({ to: "/verify-face" });
        return;
      }

      const err = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (res.status === 403 && err.error === "USER_LIMIT_REACHED") {
        clearAuthSession();
        setError(
          err.message ||
            "Users limit reached. Please contact the administrator to upgrade your plan.",
        );
        return;
      }

      clearAuthSession();
      setError(err.message || err.error || "Invalid credentials");
    } catch (err) {
      setError(
        isBackendUnreachableError(err)
          ? `Server unreachable. Please check your local backend on port 3005.`
          : "Login failed. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartFreeTrial = async () => {
    setError("");
    setIsLoading(true);
    try {
      persistPlanMode("free_trial");
      clearAuthSession();
      clearWorkspaceClientState();
      await getDeviceFingerprint();
      const guestSession = persistAuthSession(
        {
          token: "trial_guest",
          company_name: "Free Trial",
          user: { username: "Guest" },
        },
        "Guest",
      );
      setFaceVerifiedForToken(guestSession.token);
      navigate({ to: "/chat" });
    } finally {
      setIsLoading(false);
    }
  };

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

      <div className="relative z-10 flex h-full max-h-full w-full flex-row overflow-hidden">
        <aside
          className={`relative z-10 order-1 flex h-full max-h-full min-h-0 shrink-0 flex-col overflow-hidden backdrop-blur-md transition-all duration-300 ease-in-out ${
            isSidebarOpen
              ? "w-72 border-r border-[#00E699]/10"
              : "w-0 border-r-0"
          }`}
          style={{ background: "rgba(4, 28, 21, 0.55)" }}
        >
          <div
            className={`shrink-0 transition-all duration-300 ease-in-out ${
              isSidebarOpen ? "p-6 opacity-100" : "p-0 opacity-0"
            }`}
          >
            <h2 className="text-lg font-bold text-white">PRIVA AI SANDBOX</h2>
            <p className="mt-1 text-xs text-[#A3B8B0]">
              Access Mode:{" "}
              <span className="text-[#00E699]">Free Trial</span>
            </p>
            <p className="mt-3 text-xs leading-relaxed text-[#A3B8B0]">
              Explore sovereign AI in a secure sandbox before full onboarding.
            </p>
          </div>

          <div
            className={`min-h-0 flex-1 overflow-y-auto transition-all duration-300 ease-in-out ${
              isSidebarOpen ? "px-4 opacity-100" : "px-0 opacity-0"
            }`}
          >
            <div className="space-y-2 rounded-lg border border-[#00E699]/20 bg-[#041C15]/45 p-3">
              <p className="text-xs text-[#A3B8B0]">
                • 5 Sovereign AI Queries every 24 hours
              </p>
              <p className="text-xs text-[#A3B8B0]">
                • 5MB Dedicated Knowledge Base Storage
              </p>
              <p className="text-xs text-[#A3B8B0]">
                • Full Local OCR & Document Intelligence
              </p>
            </div>
          </div>

          <div
            className={`shrink-0 transition-all duration-300 ease-in-out ${
              isSidebarOpen ? "p-4 opacity-100" : "p-0 opacity-0"
            }`}
          >
            <button
              type="button"
              onClick={handleStartFreeTrial}
              disabled={isLoading}
              className="flex w-full items-center justify-center rounded-xl bg-[#054232] px-4 py-3 text-sm font-semibold text-white shadow-[0_0_12px_rgba(5,66,50,0.5)] transition-all hover:brightness-110 disabled:opacity-50"
            >
              {isLoading ? "Starting..." : "START FREE TRIAL"}
            </button>
          </div>
        </aside>

        <section className="relative z-10 order-2 flex h-full min-h-0 min-w-0 flex-1 items-center justify-center p-6 sm:p-10">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? "Collapse sidebar" : "Open sidebar"}
            className="absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-lg border border-[#00E699]/20 bg-[#041C15]/60 text-[#A3B8B0] backdrop-blur-md transition-all hover:bg-[#054232]/40 hover:text-white"
            aria-label={isSidebarOpen ? "Collapse sidebar" : "Open sidebar"}
          >
            <span className="text-sm">{isSidebarOpen ? "◀" : "▶"}</span>
          </button>
          <div className="w-full max-w-xl rounded-2xl border border-[#00E699]/20 bg-[#041C15]/65 p-6 backdrop-blur-xl sm:p-8 md:p-10">
            <div className="mb-6 text-center sm:mb-8">
              <h1
                className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl"
                style={{
                  color: "#00E699",
                  textShadow: "0 0 24px rgba(0, 230, 153, 0.45)",
                }}
              >
                PRIVA AI
              </h1>
            </div>

            <form onSubmit={handleLogin} className="space-y-5 sm:space-y-6 md:space-y-7">
              <div>
                <label className="mb-2 block text-xs font-medium tracking-wider text-[#A3B8B0] uppercase sm:text-sm">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-lg border border-[#00E699]/30 bg-[#041C15]/60 px-4 py-3.5 text-sm text-white placeholder-[#A3B8B0]/50 outline-none transition-all focus:border-[#00E699] focus:ring-1 focus:ring-[#00E699]/40 sm:px-5 sm:py-4 sm:text-base md:py-4"
                  placeholder="Enter username"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium tracking-wider text-[#A3B8B0] uppercase sm:text-sm">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-[#00E699]/30 bg-[#041C15]/60 px-4 py-3.5 text-sm text-white placeholder-[#A3B8B0]/50 outline-none transition-all focus:border-[#00E699] focus:ring-1 focus:ring-[#00E699]/40 sm:px-5 sm:py-4 sm:text-base md:py-4"
                  placeholder="Enter password"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-500/50 bg-red-950/40 px-4 py-3 text-sm text-red-400 sm:text-base"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-lg py-3.5 text-sm font-bold tracking-widest text-white uppercase transition-all hover:brightness-110 disabled:opacity-50 sm:py-4 sm:text-base md:py-4"
                style={{
                  background: "#054232",
                  boxShadow: "0 0 16px rgba(5, 66, 50, 0.5)",
                }}
              >
                {isLoading ? "Authenticating..." : "ACCESS SYSTEM"}
              </button>
            </form>
          </div>
        </section>
      </div>

      <button
        type="button"
        onClick={() => setInfoOpen(true)}
        className="fixed bottom-24 right-6 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-[#00E699]/35 bg-[#041C15]/80 text-[#00E699] shadow-[0_0_16px_rgba(0,230,153,0.15)] backdrop-blur-md transition-all hover:border-[#00E699]/60 hover:bg-[#054232]/90 hover:text-white"
        aria-label="About PRIVA AI"
        title="About"
      >
        <Info size={20} strokeWidth={2.25} />
      </button>

      {infoOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={() => setInfoOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#00E699]/20 p-5 shadow-xl sm:max-w-lg sm:p-6"
            style={{ background: "rgba(4, 28, 21, 0.96)" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-info-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2
                id="login-info-title"
                className="text-lg font-semibold text-white"
              >
                PRIVA AI
              </h2>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#00E699]/20 text-[#A3B8B0] transition-colors hover:bg-[#054232]/50 hover:text-white"
                onClick={() => setInfoOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <section className="max-h-[min(70vh,28rem)] space-y-4 overflow-y-auto pr-1">
              <div>
                <h3 className="text-xs font-bold tracking-widest text-[#00E699] uppercase">
                  About PRIVA AI
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#D5FBEA]/90">
                  PRIVA AI is an advanced, sovereign sandbox platform engineered for secure
                  data interaction. It provides a private environment where your data remains
                  localized, ensuring total privacy while utilizing intelligent document
                  processing, high-precision OCR, and context-aware AI analysis.
                </p>
              </div>

              <div>
                <h3 className="text-xs font-bold tracking-widest text-[#00E699] uppercase">
                  How to use
                </h3>
                <ul className="mt-2 space-y-2.5 text-sm leading-relaxed text-[#A3B8B0]">
                  <li>
                    <span className="font-semibold text-[#D5FBEA]">Access:</span> Log in
                    with your credentials to enter the secure dashboard.
                  </li>
                  <li>
                    <span className="font-semibold text-[#D5FBEA]">Verify:</span> Complete
                    the initial system handshake for identity verification.
                  </li>
                  <li>
                    <span className="font-semibold text-[#D5FBEA]">Upload:</span> Drag and
                    drop your documents (PDF/Images) into the Knowledge Base; the system
                    automatically performs OCR and indexing.
                  </li>
                  <li>
                    <span className="font-semibold text-[#D5FBEA]">Analyze:</span> Use the
                    AI Chat to ask questions, summarize documents, or extract specific data
                    from your uploaded files.
                  </li>
                  <li>
                    <span className="font-semibold text-[#D5FBEA]">Manage:</span> Monitor
                    your remaining queries and storage status directly from the dashboard
                    sidebar.
                  </li>
                </ul>
              </div>

              <hr className="border-[#00E699]/15" />

              <div>
                <h3 className="text-xs font-bold tracking-widest text-[#00E699] uppercase">
                  Support
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#A3B8B0]">
                  For technical assistance, email us at:{" "}
                  <a
                    href="mailto:privaai.uae@gmail.com"
                    className="font-medium text-[#00E699] underline-offset-2 hover:underline"
                  >
                    privaai.uae@gmail.com
                  </a>
                </p>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
