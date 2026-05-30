import { useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import type { AppLocale } from "../lib/locale";
import {
  detectLocaleFromText,
  getResponseHtmlLang,
  getResponseTextAlignment,
  getResponseTextDirection,
  isArabicScript,
  processCopy,
} from "../lib/locale";
import type { ParsedAssistantMessage } from "../lib/chatCitations";
import { stripCitationNoise } from "../lib/chatCitations";

interface AssistantMessageProps {
  content: string;
  parsed?: ParsedAssistantMessage | null;
  locale?: AppLocale;
  isStreaming?: boolean;
}

/** Markdown list lines — keep single newlines between adjacent list items */
const LIST_LINE_RE = /^\s*([*\-+•]|\d+\.)\s+/;

function isListLine(line: string): boolean {
  return LIST_LINE_RE.test(line);
}

/** Section / subtitle lines (AR, EN, FR) — force paragraph breaks before them */
const SECTION_HEADER_LINE_RE =
  /^(?:\*\*)?\s*(?:(?:أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|الخلاصة|الملخص|النتيجة|الخاتمة)|(?:First|Second|Third|Fourth|Fifth|Sixth|Conclusion|Summary|Introduction|Overview)|(?:Premier|Deuxième|Troisième|Quatrième|Cinquième|Conclusion|Résumé|Introduction)|(?:Section\s+\d+|[IVXLC]+\.))[\s:：\-–—]/i;

const WRAP_CLASSES =
  "min-w-0 max-w-full break-words [overflow-wrap:anywhere] whitespace-pre-wrap";

function StreamingCursor({ textDir }: { textDir: "rtl" | "ltr" }) {
  return (
    <span
      className={`inline-block h-4 w-1 shrink-0 animate-pulse bg-[#00E699] align-middle ${
        textDir === "rtl" ? "me-1" : "ms-1"
      }`}
      aria-hidden
    />
  );
}

function isSectionHeaderLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return SECTION_HEADER_LINE_RE.test(trimmed);
}

function injectBreaksBeforeSectionHeaders(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i > 0 && isSectionHeaderLine(line) && lines[i - 1].trim() !== "") {
      if (out[out.length - 1] !== "") {
        out.push("");
      }
    }
    out.push(line);
  }

  return out.join("\n");
}

/**
 * Push inline list markers onto their own line (e.g. "...suivant : 1. Item").
 */
function injectBreaksBeforeInlineListMarkers(text: string): string {
  return text.replace(
    /([^\n])\s*(?=\b\d+\.\s+|\s*[*\-+•]\s+)/g,
    "$1\n\n",
  );
}

/** Remove markdown bold asterisks for a clean plain-text layout. */
function stripMarkdownBoldMarkers(text: string): string {
  return text.replace(/\*\*/g, "");
}

/**
 * Split inline explanation text onto its own paragraph when it immediately
 * follows a section-title colon (e.g. "1. Title : Le dossier...").
 */
function injectBreaksAfterSectionTitleColons(text: string): string {
  return text.replace(/(:\s+)(?=\S)/g, ":\n\n");
}

function injectStructuralBreaks(text: string): string {
  let processed = stripMarkdownBoldMarkers(text);
  processed = injectBreaksBeforeInlineListMarkers(processed);
  processed = injectBreaksBeforeSectionHeaders(processed);
  processed = injectBreaksAfterSectionTitleColons(processed);
  return processed;
}

/**
 * Universal paragraph normalization (AR / EN / FR): single `\n` → `\n\n` unless
 * touching a list line so bullets/numbered lists stay grouped.
 */
function normalizeSingleNewlinesToParagraphs(text: string): string {
  const lines = text.split("\n");
  const parts: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    parts.push(line);

    if (next === undefined) break;

    if (line.trim() === "" || next.trim() === "") {
      parts.push("\n");
      continue;
    }

    const isCurrentList = isListLine(line);
    const isNextList = isListLine(next);

    if (isCurrentList || isNextList) {
      parts.push("\n");
      continue;
    }

    parts.push("\n\n");
  }

  return parts.join("").replace(/\n{3,}/g, "\n\n");
}

/**
 * Escape `N.` line prefixes so ReactMarkdown does not restart ordered-list counters.
 */
function escapeNumberedSectionMarkers(text: string): string {
  return text.replace(/^(\s*)(\d+)\.\s+/gm, "$1$2\\. ");
}

/**
 * Finalized assistant markdown: section hints + universal paragraph breaks.
 */
function prepareAssistantMarkdown(source: string): string {
  const normalized = source.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";

  let processed = stripMarkdownBoldMarkers(normalized);
  processed = injectBreaksBeforeInlineListMarkers(processed);
  processed = injectBreaksBeforeSectionHeaders(processed);
  processed = injectBreaksAfterSectionTitleColons(processed);
  processed = normalizeSingleNewlinesToParagraphs(processed);
  processed = escapeNumberedSectionMarkers(processed);
  return processed;
}

const PARAGRAPH_CLASSES =
  "mb-4 block text-sm font-normal leading-relaxed text-white/95 last:mb-0 break-words whitespace-pre-wrap [overflow-wrap:anywhere]";

/** Tight PRIVA-themed markdown — RTL/LTR safe, enforced paragraph rhythm */
const markdownComponents: Components = {
  p: ({ children }) => <p className={PARAGRAPH_CLASSES}>{children}</p>,
  br: () => <br className="leading-relaxed" />,
  strong: ({ children }) => (
    <strong className="font-semibold break-words text-white">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="break-words text-white/90 not-italic opacity-95">
      {children}
    </em>
  ),
  h1: ({ children }) => (
    <h1
      className={`mb-2 mt-4 text-base font-bold text-white first:mt-0 ${WRAP_CLASSES}`}
    >
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      className={`mb-2 mt-3 text-sm font-bold text-white first:mt-0 ${WRAP_CLASSES}`}
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      className={`mb-1.5 mt-2.5 text-sm font-semibold text-white/95 first:mt-0 ${WRAP_CLASSES}`}
    >
      {children}
    </h3>
  ),
  ul: ({ children }) => (
    <ul
      className={`mb-2.5 max-w-full list-disc space-y-1 ps-5 leading-relaxed marker:text-[#00E699]/70 last:mb-0 ${WRAP_CLASSES}`}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol
      className={`mb-2.5 max-w-full list-decimal space-y-1 ps-5 leading-relaxed marker:text-[#00E699]/70 last:mb-0 ${WRAP_CLASSES}`}
    >
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li
      className={`max-w-full text-white/95 ${WRAP_CLASSES} [&>p]:mb-2 [&>p]:block [&>p]:text-sm [&>p]:leading-relaxed`}
    >
      {children}
    </li>
  ),
  blockquote: ({ children }) => (
    <blockquote
      className={`my-2 max-w-full border-s-2 border-[#00E699]/40 ps-3 text-white/85 ${WRAP_CLASSES}`}
    >
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 max-w-full border-[#00E699]/15" />,
  a: ({ href, children }) => (
    <a
      href={href}
      className="break-words text-[#00E699] underline decoration-[#00E699]/40 underline-offset-2 hover:text-[#00E699]/90"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="block max-w-full overflow-x-auto rounded-lg bg-[#041C15]/80 px-3 py-2 text-xs break-words text-[#A3B8B0]">
          {children}
        </code>
      );
    }
    return (
      <code className="break-words rounded bg-[#041C15]/70 px-1 py-0.5 text-xs text-[#00E699]/95">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-2.5 max-w-full overflow-x-auto rounded-lg bg-[#041C15]/80 p-3 text-xs leading-relaxed break-words last:mb-0">
      {children}
    </pre>
  ),
};

export function AssistantMessage({
  content,
  parsed,
  isStreaming = false,
}: AssistantMessageProps) {
  const display = parsed ?? {
    answer: stripCitationNoise(content),
    sources: [],
  };

  const answerText = display.answer;
  const textDir = getResponseTextDirection(answerText);
  const textAlignment = getResponseTextAlignment(answerText);
  const responseLocale = detectLocaleFromText(answerText);
  const sourcesLabel = processCopy[responseLocale].sources;
  const fileTagPrefix = isArabicScript(answerText) ? "الملف" : "File";
  const showSources = display.sources.length > 0 && !isStreaming;

  const formattedMarkdown = useMemo(() => {
    const raw = answerText.replace(/\r\n/g, "\n").trim();
    if (!raw) return "";

    if (isStreaming) {
      return escapeNumberedSectionMarkers(injectStructuralBreaks(raw));
    }

    return prepareAssistantMarkdown(raw);
  }, [answerText, isStreaming]);

  return (
    <div className="min-w-0 max-w-full space-y-3" dir={textDir}>
      <div
        className={`priva-assistant-markdown w-full max-w-full min-w-0 overflow-x-hidden text-sm leading-relaxed text-white/95 ${textAlignment} ${
          isStreaming ? "break-words [overflow-wrap:anywhere]" : ""
        }`}
        dir={textDir}
        lang={getResponseHtmlLang(answerText)}
      >
        {formattedMarkdown ? (
          <div className="min-w-0 max-w-full break-words [overflow-wrap:anywhere] [&_p+p]:mt-0 [&>p:last-child]:mb-0">
            <ReactMarkdown
              remarkPlugins={[remarkBreaks]}
              components={markdownComponents}
            >
              {formattedMarkdown}
            </ReactMarkdown>
            {isStreaming ? <StreamingCursor textDir={textDir} /> : null}
          </div>
        ) : isStreaming ? (
          <StreamingCursor textDir={textDir} />
        ) : (
          <span className="text-white/60">—</span>
        )}
      </div>

      {showSources ? (
        <>
          <div
            className="border-t border-[#00E699]/15"
            role="separator"
            aria-hidden
          />
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#00E699]/90">
              {sourcesLabel}
            </p>
            <ul className="flex flex-row flex-wrap gap-2">
              {display.sources.map((filename) => (
                <li key={filename}>
                  <span
                    className="inline-flex max-w-full items-center rounded-lg border border-[#00E699]/25 bg-[#041C15]/60 px-3 py-1.5 text-xs font-medium text-[#A3B8B0] backdrop-blur-sm"
                    title={filename}
                    dir={textDir}
                  >
                    <span className="truncate whitespace-nowrap">
                      [{fileTagPrefix}: {filename}]
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
