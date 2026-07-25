import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Mail, ShieldCheck, X } from "lucide-react";
import {
  isBackendUnreachableError,
  persistTrialEmail,
  sendTrialOtp,
  verifyTrialOtp,
  persistPlanMode,
  persistAccessTokenSession,
  setFaceVerifiedForToken,
  clearWorkspaceClientState,
  type AuthSession,
} from "../lib/api";
import { getDeviceFingerprint } from "../lib/deviceFingerprint";

interface FreeTrialOtpModalProps {
  open: boolean;
  onClose: () => void;
  onVerified: (session: AuthSession) => void;
}

const OTP_LENGTH = 6;

export function FreeTrialOtpModal({ open, onClose, onVerified }: FreeTrialOtpModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(new Array(OTP_LENGTH).fill(""));
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!open) {
      setStep("email");
      setEmail("");
      setOtpDigits(new Array(OTP_LENGTH).fill(""));
      setError("");
      setIsLoading(false);
      setCooldown(0);
    }
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const focusOtpInput = useCallback((index: number) => {
    const next = Math.max(0, Math.min(OTP_LENGTH - 1, index));
    otpInputRefs.current[next]?.focus();
  }, []);

  const handleSendOtp = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim();
      if (!trimmed || !trimmed.includes("@")) {
        setError(t("otpInvalidEmail"));
        return;
      }

      setError("");
      setIsLoading(true);
      try {
        const result = await sendTrialOtp(trimmed);
        if (result.retry_after && result.retry_after > 0) {
          setCooldown(result.retry_after);
        } else {
          setCooldown(60);
        }
        setStep("otp");
        window.setTimeout(() => focusOtpInput(0), 50);
      } catch (err) {
        if (isBackendUnreachableError(err)) {
          setError(t("otpBackendUnreachable"));
        } else {
          setError((err as Error).message || t("otpSendFailed"));
        }
      } finally {
        setIsLoading(false);
      }
    },
    [email, t, focusOtpInput],
  );

  const handleVerifyOtp = useCallback(
    async (otpCode: string) => {
      setError("");
      setIsLoading(true);
      try {
        persistPlanMode("free_trial");
        clearWorkspaceClientState();
        await getDeviceFingerprint();

        const result = await verifyTrialOtp(email.trim(), otpCode);
        const trialToken = result.access_token || result.token || result.jwt || "";
        if (!trialToken) {
          throw new Error(t("otpVerifyFailed"));
        }

        const session = persistAccessTokenSession(trialToken, {
          companyId: "free_trial",
          companyName: "Free Trial",
          username: email.trim().split("@")[0],
        });
        setFaceVerifiedForToken(trialToken);
        persistTrialEmail(email.trim());
        onVerified(session);
      } catch (err) {
        if (isBackendUnreachableError(err)) {
          setError(t("otpBackendUnreachable"));
        } else {
          setError((err as Error).message || t("otpVerifyFailed"));
        }
        setOtpDigits(new Array(OTP_LENGTH).fill(""));
        focusOtpInput(0);
      } finally {
        setIsLoading(false);
      }
    },
    [email, t, focusOtpInput, onVerified],
  );

  const handleOtpDigitChange = useCallback(
    (index: number, value: string) => {
      if (!/^\d*$/.test(value)) return;
      const digit = value.slice(-1);
      setOtpDigits((prev) => {
        const next = [...prev];
        next[index] = digit;
        return next;
      });
      if (digit && index < OTP_LENGTH - 1) {
        focusOtpInput(index + 1);
      }
      if (digit && index === OTP_LENGTH - 1) {
        const code = otpDigits.slice(0, index).join("") + digit;
        if (code.length === OTP_LENGTH) {
          void handleVerifyOtp(code);
        }
      }
    },
    [focusOtpInput, otpDigits, handleVerifyOtp],
  );

  const handleOtpKeyDown = useCallback(
    (index: number, key: string) => {
      if (key === "Backspace" && !otpDigits[index] && index > 0) {
        setOtpDigits((prev) => {
          const next = [...prev];
          next[index - 1] = "";
          return next;
        });
        focusOtpInput(index - 1);
      }
    },
    [otpDigits, focusOtpInput],
  );

  const handleOtpPaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
      if (!pasted) return;
      const digits = pasted.split("");
      setOtpDigits((prev) => {
        const next = [...prev];
        for (let i = 0; i < OTP_LENGTH; i++) {
          next[i] = digits[i] || "";
        }
        return next;
      });
      const lastFilled = Math.min(digits.length, OTP_LENGTH) - 1;
      focusOtpInput(lastFilled);
      if (digits.length === OTP_LENGTH) {
        void handleVerifyOtp(pasted);
      }
    },
    [focusOtpInput, handleVerifyOtp],
  );

  const handleResend = useCallback(async () => {
    if (cooldown > 0 || isLoading) return;
    setError("");
    setIsLoading(true);
    try {
      const result = await sendTrialOtp(email.trim());
      if (result.retry_after && result.retry_after > 0) {
        setCooldown(result.retry_after);
      } else {
        setCooldown(60);
      }
    } catch (err) {
      if (isBackendUnreachableError(err)) {
        setError(t("otpBackendUnreachable"));
      } else {
        setError((err as Error).message || t("otpSendFailed"));
      }
    } finally {
      setIsLoading(false);
    }
  }, [cooldown, isLoading, email, t]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={() => !isLoading && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[#00E699]/20 p-6 shadow-xl sm:p-8"
        style={{ background: "rgba(4, 28, 21, 0.96)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="otp-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2
            id="otp-modal-title"
            className="flex items-center gap-2 text-base font-semibold text-white"
          >
            {step === "otp" ? (
              <button
                type="button"
                className="mr-1 rounded-lg p-1 text-[#A3B8B0] hover:text-white"
                onClick={() => {
                  setStep("email");
                  setOtpDigits(new Array(OTP_LENGTH).fill(""));
                  setError("");
                }}
                disabled={isLoading}
                aria-label={t("back")}
              >
                <ArrowLeft size={18} />
              </button>
            ) : (
              <ShieldCheck size={20} className="text-[#00E699]" />
            )}
            {step === "email" ? t("otpStartTrial") : t("otpVerifyCode")}
          </h2>
          <button
            type="button"
            className="rounded-lg p-1 text-[#A3B8B0] hover:bg-[#054232]/50 hover:text-white"
            onClick={onClose}
            disabled={isLoading}
            aria-label={t("close")}
          >
            <X size={18} />
          </button>
        </div>

        {step === "email" ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <p className="text-sm text-[#A3B8B0]">{t("otpEmailDescription")}</p>
            <div>
              <label className="mb-2 block text-xs font-medium tracking-wider text-[#A3B8B0] uppercase">
                {t("email")}
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A3B8B0]/50"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                  className="w-full rounded-lg border border-[#00E699]/30 bg-[#041C15]/60 py-3 pl-10 pr-4 text-sm text-white placeholder-[#A3B8B0]/50 outline-none transition-all focus:border-[#00E699] focus:ring-1 focus:ring-[#00E699]/40"
                  placeholder={t("otpEmailPlaceholder")}
                  autoFocus
                  disabled={isLoading}
                />
              </div>
            </div>
            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-red-500/50 bg-red-950/40 px-4 py-3 text-sm text-red-400"
              >
                {error}
              </div>
            ) : null}
            <button
              type="submit"
              disabled={isLoading || !email.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-3.5 text-sm font-bold tracking-widest text-white uppercase transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "#054232", boxShadow: "0 0 16px rgba(5, 66, 50, 0.5)" }}
            >
              {isLoading ? t("otpSending") : t("otpSendCode")}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[#A3B8B0]">
              {t("otpCodeSentTo")} <span className="font-medium text-white">{email}</span>
            </p>
            <div>
              <label className="mb-2 block text-xs font-medium tracking-wider text-[#A3B8B0] uppercase">
                {t("otpEnterCode")}
              </label>
              <div className="flex justify-center gap-2">
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      otpInputRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e.key)}
                    onPaste={handleOtpPaste}
                    className="h-12 w-11 rounded-lg border border-[#00E699]/30 bg-[#041C15]/60 text-center text-lg font-bold text-white outline-none transition-all focus:border-[#00E699] focus:ring-1 focus:ring-[#00E699]/40 sm:h-13 sm:w-12"
                    autoFocus={i === 0}
                    disabled={isLoading}
                  />
                ))}
              </div>
            </div>
            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-red-500/50 bg-red-950/40 px-4 py-3 text-sm text-red-400"
              >
                {error}
              </div>
            ) : null}
            <div className="flex flex-col items-center gap-3 pt-1">
              {cooldown > 0 ? (
                <p className="text-xs text-[#A3B8B0]">{t("otpResendIn", { seconds: cooldown })}</p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isLoading}
                  className="text-xs font-medium text-[#00E699] underline-offset-2 transition hover:underline"
                >
                  {t("otpResend")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
