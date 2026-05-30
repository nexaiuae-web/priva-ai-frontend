export type AppLocale = "en" | "ar";

const LOCALE_KEY = "priva_locale";

const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

export function isRtlLocale(locale: AppLocale): boolean {
  return locale === "ar";
}

/** True when the string contains Arabic script (used for assistant bubble direction). */
export function isArabicScript(text: string): boolean {
  return ARABIC_SCRIPT.test(String(text || ""));
}

export type TextDirection = "rtl" | "ltr";

export function getResponseTextDirection(text: string): TextDirection {
  return isArabicScript(text) ? "rtl" : "ltr";
}

/** Alignment class for markdown wrapper — LTR snaps left, RTL uses logical start. */
export function getResponseTextAlignment(
  text: string,
): "text-start" | "text-left" {
  return isArabicScript(text) ? "text-start" : "text-left";
}

export function detectLocaleFromText(text: string): AppLocale {
  return ARABIC_SCRIPT.test(text) ? "ar" : "en";
}

const FRENCH_HINT_RE =
  /[àâäéèêëïîôùûüçœæÀÂÄÉÈÊËÏÎÔÙÛÜÇŒÆ]|\b(le|la|les|des|une|un|pour|avec|résumé|merci)\b/i;

/** BCP 47 lang for assistant HTML `lang` attribute */
export function getResponseHtmlLang(text: string): string {
  if (isArabicScript(text)) return "ar";
  if (FRENCH_HINT_RE.test(text)) return "fr";
  return "en";
}

export function getStoredLocale(): AppLocale | null {
  const raw = localStorage.getItem(LOCALE_KEY);
  return raw === "ar" || raw === "en" ? raw : null;
}

/** Persist language only — do not set `dir` on `<html>` (breaks app shell layout). */
export function setStoredLocale(locale: AppLocale): void {
  localStorage.setItem(LOCALE_KEY, locale);
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
    document.documentElement.dir = "ltr";
  }
}

export function resolveAppLocale(hintText?: string): AppLocale {
  const stored = getStoredLocale();
  if (stored) return stored;
  if (hintText?.trim()) return detectLocaleFromText(hintText);
  const nav = typeof navigator !== "undefined" ? navigator.language : "en";
  return nav.toLowerCase().startsWith("ar") ? "ar" : "en";
}

export const processCopy = {
  en: {
    secureUpload: "Secure Upload",
    localEncryption: "Local Encryption",
    keyOwnership: "Key Ownership",
    extract: "Extract & OCR",
    structure: "Structure",
    index: "Vector Index",
    ready: "Ready",
    sources: "Sources",
  },
  ar: {
    secureUpload: "رفع آمن",
    localEncryption: "تشفير محلي",
    keyOwnership: "ملكية المفتاح",
    extract: "استخراج النص",
    structure: "هيكلة المستند",
    index: "فهرسة محلية",
    ready: "جاهز",
    sources: "المصادر",
  },
} as const;
