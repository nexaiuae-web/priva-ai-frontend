import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type AuthSession,
  clearAuthSession,
  getAccessToken,
  getPreAuthToken,
  isFaceVerifiedForCurrentSession,
  loadAuthSession,
  loadPlanMode,
  persistAccessTokenSession,
  persistAuthSession,
  setFaceVerifiedForToken,
} from "../lib/api";

export type AuthContextValue = {
  session: AuthSession | null;
  /** True when any Stage-1 or Stage-2 token exists. */
  isAuthenticated: boolean;
  /** True after FaceID (or free-trial guest bypass). */
  isFaceIdVerified: boolean;
  /** Stage-1 token from login; used only for `/api/auth/verify-face`. */
  preAuthToken: string | null;
  /** Stage-2 token; required for `/api/chat` and other protected APIs. */
  accessToken: string | null;
  /** Persist Stage-1 `pre_auth_token` after username/password login. */
  persistLogin: (loginPayload: unknown, username: string) => AuthSession;
  /** Swap to Stage-2 `access_token` after successful FaceID. */
  completeFaceVerification: (accessToken: string) => AuthSession;
  /** Clear all tokens and local auth state. */
  clearAuth: () => void;
  /** Re-read tokens from storage into React state. */
  refreshFromStorage: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => loadAuthSession());

  const refreshFromStorage = useCallback(() => {
    setSession(loadAuthSession());
  }, []);

  const persistLogin = useCallback((loginPayload: unknown, username: string) => {
    const next = persistAuthSession(loginPayload, username);
    setSession(next);
    return next;
  }, []);

  const completeFaceVerification = useCallback((accessToken: string) => {
    const next = persistAccessTokenSession(accessToken);
    setFaceVerifiedForToken(accessToken);
    setSession(next);
    return next;
  }, []);

  const clearAuth = useCallback(() => {
    clearAuthSession();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const preAuthToken = session?.preAuthToken ?? getPreAuthToken();
    const accessToken = session?.accessToken ?? getAccessToken();
    const isFaceIdVerified =
      isFaceVerifiedForCurrentSession() || loadPlanMode() === "free_trial";

    return {
      session,
      isAuthenticated: Boolean(preAuthToken || accessToken || session?.token),
      isFaceIdVerified,
      preAuthToken,
      accessToken,
      persistLogin,
      completeFaceVerification,
      clearAuth,
      refreshFromStorage,
    };
  }, [session, persistLogin, completeFaceVerification, clearAuth, refreshFromStorage]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
