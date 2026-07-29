import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { RequireAuth } from "../components/RequireAuth";
import {
  isFaceVerifiedForCurrentSession,
  loadAuthSession,
  persistAccessTokenSession,
  setFaceVerifiedForToken,
} from "../lib/api";
import { enforceLoginSession } from "../lib/authGuard";
import { useAuth } from "../contexts/AuthContext";
import { PASSKEY_SUPPORTED, handlePasskeyLogin, handlePasskeyRegister } from "../lib/passkey";

function ProtectedVerifyFacePage() {
  return (
    <RequireAuth requireFaceId={false}>
      <VerifyFacePage />
    </RequireAuth>
  );
}

export const Route = createFileRoute("/verify-face")({
  component: ProtectedVerifyFacePage,
  ssr: false,
  beforeLoad: () => {
    enforceLoginSession();
  },
});

function VerifyFacePage() {
  const navigate = useNavigate();
  const { completeFaceVerification, clearAuth, refreshFromStorage } = useAuth();
  const [status, setStatus] = useState("Preparing passkey sign-in\u2026");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const isVerifyingRef = useRef(false);

  useEffect(() => {
    isVerifyingRef.current = isVerifying;
  }, [isVerifying]);

  const handleBiometricSignIn = useCallback(async () => {
    if (isVerifyingRef.current) return;
    setIsVerifying(true);
    setError("");
    setStatus("Waiting for biometric\u2026");

    const session = loadAuthSession();
    if (!session?.token) {
      clearAuth();
      navigate({ to: "/" });
      return;
    }

    try {
      const result = await handlePasskeyLogin(session.token);
      if (!result.verified || !result.access_token) {
        throw new Error("Biometric verification failed. Please try again.");
      }
      persistAccessTokenSession(result.access_token);
      setFaceVerifiedForToken(result.access_token);
      completeFaceVerification(result.access_token);
      navigate({ to: "/chat" });
    } catch (err) {
      const message = extractPasskeyErrorMessage(err);
      setError(message);
      setStatus("Sign-in failed");
    } finally {
      setIsVerifying(false);
    }
  }, [clearAuth, completeFaceVerification, navigate]);

  const handleRegisterPasskey = useCallback(async () => {
    if (isVerifyingRef.current) return;
    setIsVerifying(true);
    setError("");
    setStatus("Setting up passkey\u2026");

    const session = loadAuthSession();
    if (!session?.token) {
      clearAuth();
      navigate({ to: "/" });
      return;
    }

    try {
      const result = await handlePasskeyRegister(session.token);
      if (!result.verified) {
        throw new Error("Passkey registration was not completed.");
      }
      setStatus("Passkey registered successfully!");
    } catch (err) {
      const message = extractPasskeyErrorMessage(err);
      setError(message);
      setStatus("Registration failed");
    } finally {
      setIsVerifying(false);
    }
  }, [clearAuth, navigate]);

  const handleReturnToLogin = useCallback(() => {
    clearAuth();
    navigate({ to: "/" });
  }, [clearAuth, navigate]);

  useEffect(() => {
    refreshFromStorage();
    const session = loadAuthSession();
    if (!session?.token) {
      clearAuth();
      navigate({ to: "/", replace: true });
      return;
    }
    if (isFaceVerifiedForCurrentSession() && session.accessToken) {
      navigate({ to: "/chat" });
      return;
    }
    if (!PASSKEY_SUPPORTED) {
      setStatus("Biometric sign-in not available");
      setError(
        "Your device does not support Face ID, Touch ID, or passkeys. Please use another sign-in method.",
      );
    } else {
      setStatus("Verify your identity with biometrics");
    }
  }, [clearAuth, navigate, refreshFromStorage]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#041C15]/90 via-[#0B2B22]/80 to-[#041C15]/95" />

      <div className="relative z-10 w-full max-w-[90%] px-4 sm:max-w-[450px] sm:px-6 md:max-w-[500px] lg:max-w-[560px]">
        <div
          className="rounded-2xl border border-[#00E699]/20 p-6 text-center backdrop-blur-xl sm:p-8 md:p-10"
          style={{ background: "rgba(4, 28, 21, 0.65)" }}
        >
          <div className="mb-6 sm:mb-8">
            <h1
              className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl"
              style={{
                color: "#00E699",
                textShadow: "0 0 24px rgba(0, 230, 153, 0.45)",
              }}
            >
              Secure Sign-In
            </h1>
            <p className="mt-2 text-xs text-[#A3B8B0] sm:text-sm md:text-base">{status}</p>
          </div>

          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={handleBiometricSignIn}
              disabled={isVerifying || !PASSKEY_SUPPORTED}
              className="flex w-full items-center justify-center gap-3 rounded-lg bg-[#00E699] py-4 text-sm font-bold tracking-widest text-[#041C15] uppercase shadow-[0_0_20px_rgba(0,230,153,0.25)] transition hover:bg-[#00cc88] disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 11c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-3.31 0-6 2.01-6 4.5V19h12v-1.5c0-2.49-2.69-4.5-6-4.5z"
                />
              </svg>
              Sign in with Face ID / Touch ID
            </button>

            <button
              type="button"
              onClick={handleRegisterPasskey}
              disabled={isVerifying || !PASSKEY_SUPPORTED}
              className="w-full rounded-lg border border-[#00E699]/25 py-4 text-sm text-[#A3B8B0] transition hover:border-[#00E699]/40 hover:text-[#00E699] disabled:opacity-50 sm:text-base"
            >
              Enable Passkey on this Device
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-6 rounded-lg border border-red-500/50 bg-red-950/40 px-4 py-3 text-left text-sm text-red-400 sm:text-base"
            >
              {error}
            </div>
          )}

          <div className="mt-6">
            <button
              type="button"
              onClick={handleReturnToLogin}
              disabled={isVerifying}
              className="text-sm text-[#A3B8B0] underline-offset-2 transition hover:text-[#00E699] hover:underline disabled:opacity-50 sm:text-base"
            >
              Return to sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function extractPasskeyErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "NotAllowedError" || err.message.includes("not allowed")) {
      return "Sign-in was cancelled. Please try again.";
    }
    if (err.name === "SecurityError") {
      return "Biometric sign-in is not supported in this browser. Use a supported browser or a different device.";
    }
    if (err.message.includes("authenticator")) {
      return "No biometric credential found for this account. Please use another sign-in method or enroll a new passkey.";
    }
    return err.message;
  }
  return "An unexpected error occurred. Please try again.";
}
