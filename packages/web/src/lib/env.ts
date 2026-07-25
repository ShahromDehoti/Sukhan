/**
 * Environment configuration.
 *
 * The original hard-coded the Supabase URL and anon key as string literals in
 * `utils/supabase.js`. That put them in git history and in every built bundle,
 * and meant pointing at a staging project required editing source. They now come
 * from the environment.
 *
 * ## Why the access below is written out longhand
 *
 * Vite performs a *static* text substitution of `import.meta.env.VITE_FOO` at
 * build time. It does not evaluate expressions, so a dynamic lookup —
 * `import.meta.env[name]` — is silently left alone and resolves to `undefined`
 * in a production build while working perfectly in `vite dev`. That is a
 * genuinely nasty failure mode: it passes every local check and breaks only
 * once deployed. Each variable must therefore be named literally.
 *
 * ## What is and is not a secret
 *
 * The anon key is *publishable*. It ships to every browser by design, and the
 * security boundary is Row Level Security on the database, not secrecy of this
 * value. Moving it out of source does not make it secret — it makes the project
 * configurable and keeps the deployment target out of the code.
 */

interface Env {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly isProduction: boolean;
}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy packages/web/.env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const env: Env = {
  supabaseUrl: required(import.meta.env.VITE_SUPABASE_URL, "VITE_SUPABASE_URL"),
  supabaseAnonKey: required(import.meta.env.VITE_SUPABASE_ANON_KEY, "VITE_SUPABASE_ANON_KEY"),
  isProduction: import.meta.env.PROD,
};
