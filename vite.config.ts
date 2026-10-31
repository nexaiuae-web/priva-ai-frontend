// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const PRODUCTION_API_TARGET = "https://priva-ai-api.onrender.com";

export default defineConfig({
  base: "./",
  cloudflare: false,
  vite: {
    build: {
      sourcemap: true,
    },
    environments: {
      client: {
        build: {
          rollupOptions: {
            input: "index.html",
          },
        },
      },
      ssr: {
        build: {
          rollupOptions: {
            input: "src/main.tsx",
          },
        },
      },
    },
  },
  tanstackStart: {
    client: {
      entry: "main",
    },
    spa: {
      enabled: true,
      prerender: {
        crawlLinks: false,
        routes: [],
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: PRODUCTION_API_TARGET,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    allowedHosts: true,
  },
});
