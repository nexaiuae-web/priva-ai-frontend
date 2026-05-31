import { createStart } from "@tanstack/react-start";

// Avoid custom requestMiddleware here. TanStack Start injects `next` on the
// middleware context during SSR; a mis-invoked `next()` breaks `/chat` and the
// Knowledge Base grid (especially for Free Trial). Global SSR errors are handled
// in `src/server.ts` instead.
export const startInstance = createStart(() => ({
  defaultSsr: false,
}));
