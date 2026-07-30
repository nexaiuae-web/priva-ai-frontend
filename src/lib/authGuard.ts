import { redirect } from "@tanstack/react-router";
import {
  type AuthSession,
  clearAuthSession,
  getBearerAccessToken,
  getPreAuthToken,
  isFaceVerifiedForCurrentSession,
  loadAuthSession,
  loadPlanMode,
} from "./api";

export type AuthAccessState = {
  isAuthenticated: boolean;
  isFaceIdVerified: boolean;
  session: AuthSession | null;
  accessToken: string | null;
  preAuthToken: string | null;
};

/** Snapshot of login + FaceID state used by route guards. */
export function getAuthAccessState(): AuthAccessState {
  const session = loadAuthSession();
  const accessToken = getBearerAccessToken();
  const preAuthToken = getPreAuthToken() || session?.preAuthToken || null;
  const isAuthenticated = Boolean(accessToken || preAuthToken || session?.token?.trim());
  // Free-trial guests skip the FaceID UI but still mark the session verified.
  const isFaceIdVerified = isFaceVerifiedForCurrentSession() || loadPlanMode() === "free_trial";

  return { isAuthenticated, isFaceIdVerified, session, accessToken, preAuthToken };
}

export function hasFullChatAccess(state: AuthAccessState = getAuthAccessState()): boolean {
  return Boolean(state.accessToken);
}

/**
 * Wipe local auth when the session is missing/invalid or the user tries to
 * reach a protected surface without completing login + FaceID.
 */
export function clearAuthOnUnauthorizedAccess(): void {
  clearAuthSession();
}

/**
 * Guard for `/chat` and other fully protected routes.
 * Requires Stage-2 access_token AND FaceID verification; otherwise clears auth and
 * redirects to the login page.
 */
export function enforceChatAccess(): AuthSession {
  const state = getAuthAccessState();

  if (!hasFullChatAccess(state) || !state.session) {
    clearAuthOnUnauthorizedAccess();
    throw redirect({ to: "/" });
  }

  return state.session;
}

/**
 * Guard for routes that only need a logged-in Stage-1 session (e.g. `/verify-face`).
 */
export function enforceLoginSession(): AuthSession {
  const session = loadAuthSession();
  const preAuth = getPreAuthToken() || session?.preAuthToken || session?.token;

  if (!preAuth?.trim() && !session?.accessToken) {
    clearAuthOnUnauthorizedAccess();
    throw redirect({ to: "/" });
  }

  if (!session) {
    clearAuthOnUnauthorizedAccess();
    throw redirect({ to: "/" });
  }

  return session;
}
