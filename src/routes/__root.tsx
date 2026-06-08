import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { Toaster } from "../components/ui/sonner";
import { TawkRouteGate } from "../components/TawkRouteGate";
import { useClientSecurityDefense } from "../hooks/useClientSecurityDefense";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#041C15] px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <span
          className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-[#00E699]/30 border-t-[#00E699]"
          aria-hidden
        />
        <div className="space-y-1">
          <p className="text-sm font-medium text-[#D5FBEA] sm:text-base" dir="rtl">
            جاري تهيئة الذكاء الاصطناعي...
          </p>
          <p className="text-xs text-[#A3B8B0] sm:text-sm">
            Initializing AI, please wait...
          </p>
        </div>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      { title: "PRIVA AI - Sovereign Intelligence" },
      { name: "description", content: "On-Premise Local Document Intelligence Platform" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Lovable App" },
      { property: "og:description", content: "Lovable Generated Project" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ overscrollBehavior: "none" }}>
      <head>
        <HeadContent />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              #priva-static-loading-screen {
                position: fixed;
                inset: 0;
                z-index: 9999;
                display: flex;
                min-height: 100vh;
                align-items: center;
                justify-content: center;
                background: #041c15;
                padding: 16px;
              }
              #priva-static-loading-screen .priva-loading-content {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 16px;
                text-align: center;
                font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
              }
              #priva-static-loading-screen .priva-spinner {
                width: 40px;
                height: 40px;
                border-radius: 9999px;
                border: 2px solid rgba(0, 230, 153, 0.3);
                border-top-color: #00e699;
                animation: priva-spin 1s linear infinite;
              }
              #priva-static-loading-screen .priva-loading-ar {
                margin: 0;
                color: #d5fbea;
                font-size: 14px;
                font-weight: 500;
                direction: rtl;
              }
              #priva-static-loading-screen .priva-loading-en {
                margin: 0;
                color: #a3b8b0;
                font-size: 12px;
              }
              @keyframes priva-spin {
                to {
                  transform: rotate(360deg);
                }
              }
            `,
          }}
        />
      </head>
      <body style={{ overscrollBehavior: "none" }}>
        <div id="priva-static-loading-screen" aria-hidden="true">
          <div className="priva-loading-content">
            <span className="priva-spinner" />
            <p className="priva-loading-ar">جاري تهيئة الذكاء الاصطناعي...</p>
            <p className="priva-loading-en">Initializing AI, please wait...</p>
          </div>
        </div>
        <div id="priva-app-root" style={{ minHeight: "100dvh", overscrollBehavior: "none" }}>
          {children}
        </div>
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const staticLoader = document.getElementById("priva-static-loading-screen");
    if (staticLoader) {
      staticLoader.style.display = "none";
    }

    const timer = window.setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useClientSecurityDefense();

  return (
    <QueryClientProvider client={queryClient}>
      <TawkRouteGate />
      {isLoading ? <LoadingScreen /> : <Outlet />}
      <Toaster position="top-center" richColors closeButton duration={6000} />
    </QueryClientProvider>
  );
}
