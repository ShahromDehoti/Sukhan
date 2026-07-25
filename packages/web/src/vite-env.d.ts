/// <reference types="vite/client" />

/**
 * Typed environment variables.
 *
 * Declaring these makes a typo in `import.meta.env.VITE_SUPBASE_URL` a compile
 * error rather than an `undefined` that surfaces at runtime in production.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string | undefined;
  readonly VITE_SUPABASE_ANON_KEY: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
