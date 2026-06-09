import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/__tests__/**", "src/**/*.test.{ts,tsx}", "src/**/*.d.ts"],
      reportsDirectory: "./coverage",
      reportOnFailure: true,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
