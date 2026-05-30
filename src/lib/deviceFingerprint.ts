const DEVICE_FINGERPRINT_KEY = "priva_device_fingerprint";

let cachedFingerprint: string | null = null;

function simpleHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function canvasFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return "nocanvas";
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#1f8f6f";
    ctx.fillRect(2, 2, 120, 24);
    ctx.fillStyle = "#0a2";
    ctx.fillText("PRIVA-AI-TRIAL", 4, 4);
    const data = canvas.toDataURL();
    return simpleHash(data);
  } catch {
    return "canvaserr";
  }
}

function collectFingerprintEntropy(): string {
  const nav = navigator;
  const scr = window.screen;
  const parts = [
    nav.userAgent || "",
    nav.language || "",
    String(nav.languages || ""),
    nav.platform || "",
    String(nav.hardwareConcurrency || 0),
    String(nav.maxTouchPoints || 0),
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    String(scr?.width || 0),
    String(scr?.height || 0),
    String(scr?.colorDepth || 0),
    canvasFingerprint(),
  ];
  return parts.join("|");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getDeviceFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint;
  const stored = localStorage.getItem(DEVICE_FINGERPRINT_KEY);
  if (stored && stored.trim()) {
    cachedFingerprint = stored.trim();
    return cachedFingerprint;
  }

  const entropy = collectFingerprintEntropy();
  const fingerprint = await sha256Hex(entropy);
  cachedFingerprint = fingerprint;
  localStorage.setItem(DEVICE_FINGERPRINT_KEY, fingerprint);
  return fingerprint;
}
