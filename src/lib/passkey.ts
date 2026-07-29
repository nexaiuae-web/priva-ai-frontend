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

export interface PasskeyLoginResult {
  verified: boolean;
  access_token?: string;
  jwt?: string;
}

export interface PasskeyRegisterResult {
  verified: boolean;
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
  const res = await fetch(buildApiUrl("/api/auth/passkey/login-options"), {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as Record<string, string>).error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<PublicKeyCredentialRequestOptionsJSON>;
}

async function fetchRegisterOptions(
  token?: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const headers = await buildClientHeaders({
    contentType: "application/json",
    planMode: loadPlanMode(),
    token: token ?? getAuthToken(),
  });
  const res = await fetch(buildApiUrl("/api/auth/passkey/register-options"), {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as Record<string, string>).error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<PublicKeyCredentialCreationOptionsJSON>;
}

async function verifyPasskeyResponse<T>(url: string, payload: unknown, token?: string): Promise<T> {
  const headers = await buildClientHeaders({
    contentType: "application/json",
    planMode: loadPlanMode(),
    token: token ?? getAuthToken(),
  });
  const res = await fetch(buildApiUrl(url), {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body.error || `Verification failed (${res.status})`);
  }
  return body;
}

export async function handlePasskeyLogin(token?: string): Promise<PasskeyLoginResult> {
  const options = await fetchLoginOptions(token);

  const authResp = await startAuthentication({ optionsJSON: options });

  const result = await verifyPasskeyResponse<PasskeyLoginResult>(
    "/api/auth/passkey/login-verify",
    authResp,
    token,
  );

  return result;
}

export async function handlePasskeyRegister(token?: string): Promise<PasskeyRegisterResult> {
  const options = await fetchRegisterOptions(token);

  const regResp = await startRegistration({ optionsJSON: options });

  const result = await verifyPasskeyResponse<PasskeyRegisterResult>(
    "/api/auth/passkey/register-verify",
    regResp,
    token,
  );

  return result;
}
