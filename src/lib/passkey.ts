import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialRequestOptionsJSON,
  PublicKeyCredentialCreationOptionsJSON,
} from "@simplewebauthn/browser";
import { buildApiUrl, buildClientHeaders, loadPlanMode, loadAuthSession } from "./api";

export const PASSKEY_SUPPORTED = browserSupportsWebAuthn();

const PASSKEY_TIMEOUT_MS = 8000;

export interface PasskeyLoginResult {
  verified: boolean;
  access_token?: string;
  jwt?: string;
  error?: string;
  details?: string;
  status?: string;
  success?: boolean;
}

export interface PasskeyRegisterResult {
  verified: boolean;
  error?: string;
  details?: string;
  status?: string;
  success?: boolean;
}

const RATE_LIMIT_MESSAGE = "Too many attempts. Please wait a minute and try again.";

function sanitizeApiError(body: Record<string, unknown>, status: number): string {
  const raw =
    typeof body.error === "string"
      ? body.error
      : typeof body.details === "string"
        ? body.details
        : "";
  if (
    status === 429 ||
    raw === "OTP_RATE_LIMITED" ||
    raw.includes("RATE_LIMITED") ||
    raw.includes("rate_limit")
  ) {
    return RATE_LIMIT_MESSAGE;
  }
  return raw || `Request failed (${status})`;
}

function getAuthToken(): string | undefined {
  const session = loadAuthSession();
  return session?.token || undefined;
}

async function fetchLoginOptions(token?: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const headers = await buildClientHeaders({
    contentType: "application/json",
    planMode: loadPlanMode(),
    token: token ?? getAuthToken(),
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PASSKEY_TIMEOUT_MS);
  try {
    const res = await fetch(buildApiUrl("/api/auth/passkey/login-options"), {
      method: "POST",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(sanitizeApiError(body as Record<string, unknown>, res.status));
    }
    return res.json() as Promise<PublicKeyCredentialRequestOptionsJSON>;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Passkey request timed out. Please check your connection and try again.");
    }
    throw err;
  }
}

async function fetchRegisterOptions(
  token?: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  console.log("[PASSKEY FRONTEND] Fetching register options...");
  const headers = await buildClientHeaders({
    contentType: "application/json",
    planMode: loadPlanMode(),
    token: token ?? getAuthToken(),
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PASSKEY_TIMEOUT_MS);
  try {
    const res = await fetch(buildApiUrl("/api/auth/passkey/register-options"), {
      method: "POST",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    console.log("[PASSKEY FRONTEND] Register options response status:", res.status);
    const json = await res.json().catch(() => ({}));
    console.log("[PASSKEY FRONTEND] Register options response JSON:", JSON.stringify(json));
    if (!res.ok) {
      throw new Error(sanitizeApiError(json as Record<string, unknown>, res.status));
    }
    return json as PublicKeyCredentialCreationOptionsJSON;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Passkey request timed out. Please check your connection and try again.");
    }
    throw err;
  }
}

async function verifyPasskeyResponse<T>(url: string, payload: unknown, token?: string): Promise<T> {
  const headers = await buildClientHeaders({
    contentType: "application/json",
    planMode: loadPlanMode(),
    token: token ?? getAuthToken(),
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PASSKEY_TIMEOUT_MS);
  try {
    const res = await fetch(buildApiUrl(url), {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
      throw new Error(sanitizeApiError(body as Record<string, unknown>, res.status));
    }
    return body;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Passkey verification timed out. Please check your connection and try again.");
    }
    throw err;
  }
}

export async function handlePasskeyLogin(token?: string): Promise<PasskeyLoginResult> {
  const authToken = token ?? getAuthToken();

  try {
    const options = await fetchLoginOptions(authToken);

    const authResp = await startAuthentication({ optionsJSON: options });

    const result = await verifyPasskeyResponse<PasskeyLoginResult>(
      "/api/auth/passkey/login-verify",
      authResp,
      authToken,
    );

    if (result.error || result.details) {
      throw new Error(result.error || result.details);
    }

    if (!result.verified && result.success !== true && result.status !== "ok") {
      throw new Error("Biometric verification failed.");
    }

    return result;
  } catch (err) {
    console.error("[PASSKEY FRONTEND ERROR]:", err);
    throw err;
  }
}

export async function handlePasskeyRegister(token?: string): Promise<PasskeyRegisterResult> {
  const authToken = token ?? getAuthToken();
  if (!authToken) {
    throw new Error("You must be logged in to register a Passkey on this device.");
  }

  try {
    const options = await fetchRegisterOptions(authToken);

    const regResp = await startRegistration({ optionsJSON: options });

    const result = await verifyPasskeyResponse<PasskeyRegisterResult>(
      "/api/auth/passkey/register-verify",
      regResp,
      authToken,
    );

    console.log("[PASSKEY REGISTER RESPONSE]:", result);

    if (result.error || result.details) {
      throw new Error(result.error || result.details);
    }

    if (!result.verified && result.success !== true && result.status !== "ok") {
      throw new Error("Passkey registration was not completed.");
    }

    return result;
  } catch (err) {
    console.error("[PASSKEY FRONTEND ERROR]:", err);
    throw err;
  }
}
