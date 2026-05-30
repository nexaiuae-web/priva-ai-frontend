import { ChevronLeft, ChevronRight, Lock, Shield, Upload } from "lucide-react";
import type { AppLocale } from "../lib/locale";
import { isRtlLocale, processCopy } from "../lib/locale";

export type ProcessStepId =
  | "upload"
  | "encrypt"
  | "keys"
  | "extract"
  | "structure"
  | "index"
  | "ready";

interface ProcessCycleFlowProps {
  locale: AppLocale;
  /** closed-loop sovereignty pipeline */
  variant?: "sovereignty" | "document";
  activeStepId?: ProcessStepId;
  className?: string;
}

const sovereigntySteps: ProcessStepId[] = ["upload", "encrypt", "keys"];
const documentSteps: ProcessStepId[] = ["upload", "extract", "structure", "index", "ready"];

function stepLabel(locale: AppLocale, id: ProcessStepId): string {
  const copy = processCopy[locale];
  switch (id) {
    case "upload":
      return copy.secureUpload;
    case "encrypt":
      return copy.localEncryption;
    case "keys":
      return copy.keyOwnership;
    case "extract":
      return copy.extract;
    case "structure":
      return copy.structure;
    case "index":
      return copy.index;
    case "ready":
      return copy.ready;
    default:
      return id;
  }
}

function StepIcon({ id }: { id: ProcessStepId }) {
  if (id === "upload") return <Upload size={14} className="shrink-0" />;
  if (id === "encrypt" || id === "keys") return <Lock size={14} className="shrink-0" />;
  return <Shield size={14} className="shrink-0" />;
}

function mapPhaseToStep(phase: string): ProcessStepId {
  const p = phase.toLowerCase();
  if (p.includes("complete") || p.includes("ready")) return "ready";
  if (p.includes("embed") || p.includes("index")) return "index";
  if (p.includes("chunk") || p.includes("saving")) return "structure";
  if (p.includes("extract") || p.includes("ocr")) return "extract";
  if (p.includes("encrypt")) return "encrypt";
  if (p.includes("key")) return "keys";
  return "upload";
}

export function phaseToActiveStep(phase: string): ProcessStepId {
  return mapPhaseToStep(phase || "");
}

export function ProcessCycleFlow({
  locale,
  variant = "sovereignty",
  activeStepId = "upload",
  className = "",
}: ProcessCycleFlowProps) {
  const rtl = isRtlLocale(locale);
  const steps = variant === "document" ? documentSteps : sovereigntySteps;
  const ArrowIcon = rtl ? ChevronLeft : ChevronRight;

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      className={`flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 ${className}`}
      aria-label={variant === "sovereignty" ? "Secure processing cycle" : "Document processing cycle"}
    >
      {steps.map((id, index) => {
        const active = id === activeStepId;
        const complete =
          steps.indexOf(activeStepId) > index ||
          (activeStepId === "ready" && id !== "ready");

        return (
          <div key={id} className="flex items-center gap-1.5 sm:gap-2">
            <div
              className={`flex min-w-[5.5rem] max-w-[7.5rem] flex-col items-center gap-1 rounded-xl border px-2 py-2 text-center transition-all sm:min-w-[6.5rem] ${
                active
                  ? "border-[#00E699]/60 bg-[#00E699]/15 text-white shadow-[0_0_16px_rgba(0,230,153,0.2)]"
                  : complete
                    ? "border-[#00E699]/25 bg-[#054232]/50 text-[#A3B8B0]"
                    : "border-[#00E699]/10 bg-[#041C15]/40 text-[#A3B8B0]/80"
              }`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full ${
                  active ? "bg-[#00E699]/25 text-[#00E699]" : "bg-[#054232]/60 text-[#A3B8B0]"
                }`}
              >
                <StepIcon id={id} />
              </span>
              <span className="text-[10px] font-semibold leading-tight sm:text-[11px]">
                {stepLabel(locale, id)}
              </span>
            </div>
            {index < steps.length - 1 ? (
              <ArrowIcon
                size={16}
                className="shrink-0 text-[#00E699]/50 ltr:rotate-0 rtl:rotate-0"
                aria-hidden
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Compact multi-slot gallery indicator (FaceID / reference embeddings). */
export function MultiEmbeddingGalleryStrip({
  locale,
  filledSlots = 1,
  maxSlots = 5,
}: {
  locale: AppLocale;
  filledSlots?: number;
  maxSlots?: number;
}) {
  const rtl = isRtlLocale(locale);
  const label = locale === "ar" ? "معرض المراجع" : "Reference gallery";

  return (
    <div dir={rtl ? "rtl" : "ltr"} className="mt-4">
      <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-widest text-[#A3B8B0]">
        {label}
      </p>
      <div className="flex items-center justify-center gap-2">
        {Array.from({ length: maxSlots }, (_, index) => {
          const filled = index < filledSlots;
          return (
            <span
              key={index}
              className={`h-2.5 w-8 rounded-full transition-all ${
                filled
                  ? "bg-[#00E699] shadow-[0_0_8px_rgba(0,230,153,0.45)]"
                  : "bg-[#054232]/60 ring-1 ring-[#00E699]/15"
              }`}
              title={`${label} ${index + 1}`}
            />
          );
        })}
      </div>
    </div>
  );
}
