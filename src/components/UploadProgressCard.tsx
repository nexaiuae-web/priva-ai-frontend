import type { UploadProgressState } from "../lib/upload-sse";
import type { AppLocale } from "../lib/locale";
import { resolveAppLocale } from "../lib/locale";
import {
  MultiEmbeddingGalleryStrip,
  ProcessCycleFlow,
  phaseToActiveStep,
} from "./ProcessCycleFlow";

interface UploadProgressCardProps {
  progress: UploadProgressState;
  filename?: string;
  locale?: AppLocale;
}

export function UploadProgressCard({
  progress,
  filename,
  locale: localeProp,
}: UploadProgressCardProps) {
  const locale = localeProp ?? resolveAppLocale(filename);
  const showCounts = progress.total > 0;
  const documentStep = phaseToActiveStep(progress.phase || "");
  const sovereigntyStep: typeof documentStep =
    progress.percent >= 98
      ? "keys"
      : progress.percent >= 35
        ? "encrypt"
        : "upload";
  const filledGallerySlots = Math.min(
    5,
    Math.max(1, Math.round((progress.percent / 100) * 5)),
  );

  return (
    <div
      className="mx-6 mt-4 rounded-2xl border border-[#00E699]/20 p-5 shadow-[0_0_24px_rgba(0,230,153,0.08)] backdrop-blur-md"
      style={{ background: "rgba(4, 28, 21, 0.65)" }}
      role="status"
      aria-live="polite"
      aria-label="Upload progress"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">
            {locale === "ar" ? "معالجة المستند" : "Processing document"}
          </p>
          {filename && (
            <p className="mt-0.5 truncate text-xs text-[#A3B8B0]">{filename}</p>
          )}
        </div>
        <span className="shrink-0 text-lg font-bold tabular-nums text-[#00E699]">
          {Math.round(progress.percent)}%
        </span>
      </div>

      <ProcessCycleFlow
        locale={locale}
        variant="sovereignty"
        activeStepId={sovereigntyStep}
        className="mb-4"
      />

      <ProcessCycleFlow
        locale={locale}
        variant="document"
        activeStepId={documentStep}
        className="mb-4 opacity-90"
      />

      <MultiEmbeddingGalleryStrip
        locale={locale}
        filledSlots={filledGallerySlots}
      />

      <div className="mb-3 mt-4 h-2.5 overflow-hidden rounded-full bg-[#054232]/60">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#054232] via-[#00E699]/80 to-[#00E699] transition-[width] duration-300 ease-out rtl:bg-gradient-to-l"
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      <p className="text-sm leading-relaxed text-white/90">
        {progress.phase || (locale === "ar" ? "جاري العمل…" : "Working…")}
      </p>

      {showCounts && (
        <p className="mt-1.5 text-xs tabular-nums text-[#A3B8B0]">
          {progress.current} / {progress.total}
        </p>
      )}
    </div>
  );
}
