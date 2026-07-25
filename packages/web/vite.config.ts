import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * `@sukhan/core` is aliased to its TypeScript source rather than its built
 * `dist`. Editing the domain then refreshing the browser just works, with no
 * rebuild step and no stale-build class of bug. The alias mirrors the `paths`
 * entry in tsconfig.json, so the type checker and the bundler agree.
 */
const coreSrc = fileURLToPath(new URL("../core/src/index.ts", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@sukhan/core": coreSrc },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split vendor code so an application change does not invalidate the
        // (large, rarely-changing) React and Supabase chunks in users' caches.
        manualChunks: {
          react: ["react", "react-dom", "react-router"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
