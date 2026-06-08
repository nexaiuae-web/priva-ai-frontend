import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearAuthSession,
  FACE_PROFILE_NOT_CONFIGURED_MESSAGE,
  FACE_VERIFY_FAILED_MESSAGE,
  isBackendUnreachableError,
  isFaceVerifiedForCurrentSession,
  loadAuthSession,
  setFaceVerifiedForToken,
  verifyFaceSnapshot,
} from "../lib/api";
import { preprocessFaceCaptureCanvas } from "../lib/faceCapturePreprocess";

export const Route = createFileRoute("/verify-face")({
  component: VerifyFacePage,
});

function VerifyFacePage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<number | null>(null);

  const [status, setStatus] = useState("Requesting camera access…");
  const [error, setError] = useState("");
  const [verificationFailed, setVerificationFailed] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const isE2eFaceBypassEnabled =
    typeof window !== "undefined" &&
    localStorage.getItem("E2E_FACE_BYPASS_ENABLED") === "true";

  const stopCamera = useCallback(() => {
    if (captureTimerRef.current != null) {
      window.clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const captureAndVerify = useCallback(async () => {
    const video = videoRef.current;
    const session = loadAuthSession();

    if (!session?.token) {
      navigate({ to: "/" });
      return;
    }

    if (!video || video.videoWidth === 0) {
      setError("Camera is not ready. Please try again.");
      setVerificationFailed(true);
      setStatus("Camera not ready");
      return;
    }

    setIsVerifying(true);
    setStatus("Verifying identity…");
    setError("");
    setVerificationFailed(false);

    try {
      const canvas = document.createElement("canvas");
      const size = Math.min(video.videoWidth, video.videoHeight);
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error(FACE_VERIFY_FAILED_MESSAGE);
      }

      const offsetX = (video.videoWidth - size) / 2;
      const offsetY = (video.videoHeight - size) / 2;
      ctx.drawImage(video, offsetX, offsetY, size, size, 0, 0, size, size);

      const optimized = preprocessFaceCaptureCanvas(canvas);
      const dataUrl = optimized.toDataURL("image/jpeg", 0.92);
      await verifyFaceSnapshot(dataUrl, {
        onRetry: () => {
          setStatus("Connection unstable, retrying…");
        },
      });
      setFaceVerifiedForToken(session.token);
      stopCamera();
      navigate({ to: "/chat" });
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      const message =
        code === "FACE_PROFILE_NOT_CONFIGURED"
          ? FACE_PROFILE_NOT_CONFIGURED_MESSAGE
          : isBackendUnreachableError(err)
            ? "Unable to reach the verification server. Please check your connection and try again."
            : (err as Error).message || FACE_VERIFY_FAILED_MESSAGE;
      setError(message);
      setVerificationFailed(true);
      if (code === "FACE_PROFILE_NOT_CONFIGURED") {
        setStatus("Face profile not configured");
      } else if (isBackendUnreachableError(err)) {
        setStatus("Connection failed — please try again");
      } else {
        setStatus("Verification failed — adjust lighting or position and try again");
      }
    } finally {
      setIsVerifying(false);
      setCountdown(null);
    }
  }, [navigate, stopCamera]);

  const scheduleCapture = useCallback(() => {
    if (captureTimerRef.current != null) {
      window.clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }

    setStatus("Hold still — capturing in 2 seconds…");
    setCountdown(2);
    captureTimerRef.current = window.setTimeout(() => {
      setCountdown(1);
      captureTimerRef.current = window.setTimeout(() => {
        setCountdown(null);
        void captureAndVerify();
      }, 1000);
    }, 1000);
  }, [captureAndVerify]);

  const startCamera = useCallback(async () => {
    if (captureTimerRef.current != null) {
      window.clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    setCountdown(null);
    setIsVerifying(false);
    setError("");
    setVerificationFailed(false);
    setStatus("Requesting camera access…");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("Position your face in the circle");
      scheduleCapture();
    } catch {
      setError("Camera access is required for FaceID verification.");
      setVerificationFailed(true);
      setStatus("Camera access denied");
    }
  }, [scheduleCapture]);

  const handleRetry = useCallback(() => {
    setError("");
    setVerificationFailed(false);
    setIsVerifying(false);
    setCountdown(null);

    if (captureTimerRef.current != null) {
      window.clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }

    const video = videoRef.current;
    if (streamRef.current?.active && video?.srcObject) {
      setStatus("Position your face in the circle");
      scheduleCapture();
      return;
    }

    stopCamera();
    void startCamera();
  }, [scheduleCapture, startCamera, stopCamera]);

  const handleReturnToLogin = useCallback(() => {
    stopCamera();
    clearAuthSession();
    navigate({ to: "/" });
  }, [navigate, stopCamera]);

  useEffect(() => {
    const session = loadAuthSession();
    if (!session?.token) {
      navigate({ to: "/" });
      return;
    }
    if (isE2eFaceBypassEnabled && session.username?.trim()) {
      setFaceVerifiedForToken(session.token);
      navigate({ to: "/chat" });
      return;
    }
    if (isFaceVerifiedForCurrentSession()) {
      navigate({ to: "/chat" });
      return;
    }

    void startCamera();

    return () => {
      stopCamera();
    };
  }, [isE2eFaceBypassEnabled, navigate, startCamera, stopCamera]);

  const showErrorActions = Boolean(error) || verificationFailed;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#041C15]">
      <div className="absolute inset-0 bg-gradient-to-b from-[#041C15]/90 via-[#0B2B22]/80 to-[#041C15]/95" />

      {/* Verification card — same fluid breakpoints as login */}
      <div className="relative z-10 w-full max-w-[90%] px-4 sm:max-w-[450px] sm:px-6 md:max-w-[500px] lg:max-w-[560px]">
        <div
          className="rounded-2xl border border-[#00E699]/20 p-6 text-center backdrop-blur-xl sm:p-8 md:p-10 lg:p-10"
          style={{ background: "rgba(4, 28, 21, 0.65)" }}
        >
          <div className="mb-6 sm:mb-8 md:mb-10">
            <h1
              className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl"
              style={{
                color: "#00E699",
                textShadow: "0 0 24px rgba(0, 230, 153, 0.45)",
              }}
            >
              FaceID Verification
            </h1>
            <p className="mt-2 text-xs text-[#A3B8B0] sm:text-sm md:text-base">{status}</p>
          </div>

          <div className="relative mx-auto mt-6 h-52 w-52 sm:mt-8 sm:h-56 sm:w-56 md:mt-10 md:h-64 md:w-64 lg:h-72 lg:w-72">
            <div className="absolute inset-0 rounded-full border-2 border-[#00E699]/40 shadow-[0_0_40px_rgba(0,230,153,0.25)] md:border-[3px] lg:shadow-[0_0_56px_rgba(0,230,153,0.3)]" />
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full rounded-full object-cover"
            />
            {countdown != null && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
                {countdown}
              </div>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="mt-6 rounded-lg border border-red-500/50 bg-red-950/40 px-4 py-3 text-left text-sm text-red-400 sm:mt-7 sm:text-base md:mt-8"
            >
              {error}
            </div>
          )}

          {isVerifying && (
            <p className="mt-4 text-xs tracking-widest text-[#00E699]/80 uppercase sm:mt-5 sm:text-sm md:text-base">
              Scanning…
            </p>
          )}

          {showErrorActions && (
            <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:gap-4 md:mt-10">
              <button
                type="button"
                onClick={handleRetry}
                disabled={isVerifying}
                className="w-full rounded-lg bg-[#00E699] py-3.5 text-sm font-bold tracking-widest text-[#041C15] uppercase shadow-[0_0_20px_rgba(0,230,153,0.25)] transition hover:bg-[#00cc88] disabled:cursor-not-allowed disabled:opacity-50 sm:py-4 sm:text-base md:py-4"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={handleReturnToLogin}
                disabled={isVerifying}
                className="w-full rounded-lg border border-[#00E699]/25 py-3.5 text-sm text-[#A3B8B0] transition hover:border-[#00E699]/40 hover:text-[#00E699] disabled:opacity-50 sm:py-4 sm:text-base md:py-4"
              >
                Return to login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
