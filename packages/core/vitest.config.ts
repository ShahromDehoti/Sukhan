import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // `index.ts` is a re-export barrel and `types.ts` is type-only; neither
      // contains a runtime statement, so both would report 0% and drag the
      // real number down without saying anything about test quality.
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/types.ts"],
      // The domain core is pure and fully reachable, so it is held to a far
      // higher bar than the I/O-bound packages.
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
});
