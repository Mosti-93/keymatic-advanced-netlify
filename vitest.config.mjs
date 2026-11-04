import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react({ include: /\.(js|jsx)$/ })],
  // Next.js lets .js files contain JSX; tell the test bundler the same.
  esbuild: { loader: "jsx", jsx: "automatic", include: /src\/.*\.jsx?$/, exclude: [] },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.mjs"],
    include: ["src/**/*.test.{js,jsx,ts,tsx}", "supabase/**/*.test.js"],
    coverage: { provider: "v8", include: ["src/lib/**", "src/utils/**", "src/components/**"] },
  },
});
