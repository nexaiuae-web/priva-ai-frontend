import { redirect } from "@tanstack/react-router";
import {
  type AuthSession,
  clearAuthSession,
  isFaceVerifiedForCurrentSession,
  loadAuthSession,
  loadPlanMode,
} from "./api";

export type AuthAccessState = {
  isAuthenticated: boolean;
  isFaceIdVerified: boolean;
  session: AuthSession | null;
};

/** Snapshot of login + FaceID state used by route guards. */
export function getAuthAccessState(): AuthAccessState {
  const session = loadAuthSession();
  const isAuthenticated = Boolean(session?.token?.trim());
  // Free-trial guests skip the FaceID UI but still mark the session verified.
  const isFaceIdVerified =
    isFaceVerifiedForCurrentSession() || loadPlanMode() === "free_trial";

  return { isAuthenticated, isFaceIdVerified, session };
}

export function hasFullChatAccess(state: AuthAccessState = getAuthAccessState()): boolean {
  return state.isAuthenticated && state.isFaceIdVerified;
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
 * Requires a valid token AND FaceID verification; otherwise clears auth and
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
 * Guard for routes that only need a logged-in session (e.g. `/verify-face`).
 */
export function enforceLoginSession(): AuthSession {
  const session = loadAuthSession();

  if (!session?.token?.trim()) {
    clearAuthOnUnauthorizedAccess();
    throw redirect({ to: "/" });
  }

  return session;
}
