import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

const TAWK_EMBED_SRC =
  "https://embed.tawk.to/6a23bc728705f01c35097280/1jqdpg8v5";

function isTawkAllowedPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/login";
}

declare global {
  interface Window {
    Tawk_API?: {
      hideWidget?: () => void;
      showWidget?: () => void;
      onLoad?: () => void;
    };
    Tawk_LoadStart?: Date;
  }
}

function setTawkVisibility(visible: boolean): void {
  document.body.classList.toggle("priva-tawk-visible", visible);

  if (!window.Tawk_API) return;
  if (visible) {
    window.Tawk_API.showWidget?.();
  } else {
    window.Tawk_API.hideWidget?.();
  }
}

function ensureTawkScriptLoaded(onReady: () => void): void {
  window.Tawk_API = window.Tawk_API || {};
  const previousOnLoad = window.Tawk_API.onLoad;
  window.Tawk_API.onLoad = function tawkOnLoad() {
    if (typeof previousOnLoad === "function") {
      previousOnLoad();
    }
    onReady();
  };

  if (document.getElementById("tawk-script")) {
    onReady();
    return;
  }

  window.Tawk_LoadStart = new Date();
  const script = document.createElement("script");
  script.id = "tawk-script";
  script.async = true;
  script.src = TAWK_EMBED_SRC;
  script.charset = "UTF-8";
  script.setAttribute("crossorigin", "*");
  document.body.appendChild(script);
}

/** Show Tawk.to only on the login routes; hide on /chat, /verify-face, etc. */
export function TawkRouteGate() {
  const { pathname } = useLocation();

  useEffect(() => {
    const visible = isTawkAllowedPath(pathname);

    ensureTawkScriptLoaded(() => {
      setTawkVisibility(visible);
    });

    setTawkVisibility(visible);
  }, [pathname]);

  return null;
}
