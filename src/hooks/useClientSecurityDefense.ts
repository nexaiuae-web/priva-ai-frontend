import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { installClientSecurityDefense } from "../lib/clientSecurityDefense";
import type { ClientSecurityDefenseHandle } from "../lib/clientSecurityDefense";

/**
 * Activates global client-side anti-tampering defenses at the application root.
 */
export function useClientSecurityDefense(): void {
  const handleRef = useRef<ClientSecurityDefenseHandle | null>(null);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    handleRef.current = installClientSecurityDefense();
    return () => {
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    handleRef.current?.refresh();
  }, [pathname]);
}
