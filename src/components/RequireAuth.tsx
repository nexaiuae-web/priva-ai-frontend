import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  clearAuthOnUnauthorizedAccess,
  getAuthAccessState,
  hasFullChatAccess,
} from "../lib/authGuard";

type RequireAuthProps = {
  children: ReactNode;
  /**
   * When true (default), require both username/password login and FaceID.
   * When false, only require a valid session token (e.g. FaceID page).
   */
  requireFaceId?: boolean;
};

/**
 * Client-side route guard. Blocks rendering until auth checks pass;
 * otherwise clears auth state and redirects to `/`.
 */
export function RequireAuth({ children, requireFaceId = true }: RequireAuthProps) {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const state = getAuthAccessState();
    const ok = requireFaceId ? hasFullChatAccess(state) : state.isAuthenticated;

    if (!ok) {
      clearAuthOnUnauthorizedAccess();
      void navigate({ to: "/", replace: true });
      return;
    }

    setAllowed(true);
  }, [navigate, requireFaceId]);

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}
