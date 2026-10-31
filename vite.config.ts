// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRODUCTION_API_TARGET = "https://priva-ai-api.onrender.com";

export default defineConfig({
  base: "./",
  cloudflare: false,
  vite: {
    build: {
      sourcemap: true,
    },
    plugins: [
      {
        name: "stub-node-builtins-client",
        enforce: "pre",
        apply(config, { command, isSsrBuild }) {
          if (command === "build") {
            return true;
          }
          return true;
        },
        resolveId(id, importer) {
          const isClient = !importer?.includes("server") && !importer?.includes("ssr") && (importer?.includes("client") || importer?.includes("main.tsx") || importer?.includes("router") || importer?.includes("index.html"));
          if (id === "@tanstack/start-storage-context") {
            return path.resolve(__dirname, "./src/stubs/start-storage-context.ts");
          }
          if (id === "node:async_hooks" || id === "async_hooks") {
            return path.resolve(__dirname, "./src/stubs/node-async-hooks.ts");
          }
          if (id.startsWith("node:")) {
            return path.resolve(__dirname, "./src/stubs/node-async-hooks.ts");
          }
          return null;
        },
      },
    ],
    environments: {
      client: {
        resolve: {
          alias: {
            "@tanstack/start-storage-context": path.resolve(__dirname, "./src/stubs/start-storage-context.ts"),
            "node:async_hooks": path.resolve(__dirname, "./src/stubs/node-async-hooks.ts"),
            async_hooks: path.resolve(__dirname, "./src/stubs/node-async-hooks.ts"),
          },
        },
        build: {
          rollupOptions: {
            input: "index.html",
            external: [
              /^node:/,
              "node:async_hooks",
              "async_hooks",
              "@tanstack/start-storage-context",
            ],
          },
        },
      },
      ssr: {
        resolve: {
          alias: {},
        },
        build: {
          rollupOptions: {
            input: "src/main.tsx",
          },
        },
      },
    },
    resolve: {
      alias: {
        "@tanstack/start-storage-context": path.resolve(__dirname, "./src/stubs/start-storage-context.ts"),
        "node:async_hooks": path.resolve(__dirname, "./src/stubs/node-async-hooks.ts"),
        async_hooks: path.resolve(__dirname, "./src/stubs/node-async-hooks.ts"),
      },
    },
    optimizeDeps: {
      exclude: ["node:async_hooks", "async_hooks", "@tanstack/start-storage-context"],
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
