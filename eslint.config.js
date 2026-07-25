import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Workspace-wide lint configuration.
 *
 * Type-aware rules are enabled (`recommendedTypeChecked` + `stylisticTypeChecked`)
 * rather than the syntax-only preset. That costs a slower lint run in exchange
 * for catching a class of defect the syntax rules cannot see at all — floating
 * promises, unsafe `any` propagation, conditions that are always truthy — which
 * is precisely the category that survives review in a JavaScript codebase.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/*.config.js",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // projectService resolves each file to its own package's tsconfig,
        // which is what makes type-aware linting work across a workspace.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unused variables are errors, with the conventional underscore escape
      // hatch for deliberately-ignored parameters and caught errors.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // A dropped promise in an async handler fails silently in production.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // Prefer explicit `import type` so the emitted JS has no phantom imports.
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },

  {
    // Tests reach for non-null assertions constantly when indexing fixtures.
    // Under noUncheckedIndexedAccess that is the readable choice, and a wrong
    // assertion fails the test immediately rather than shipping.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
    },
  },
);
