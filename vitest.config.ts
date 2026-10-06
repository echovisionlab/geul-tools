import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { aliases } from "./vite.config.ts";
export default defineConfig({
  plugins: [react()],
  resolve: { alias: aliases },
  test: {
    globals: true,
    setupFiles: ["./shared/client/test-setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "server/**", ".github/**"],
  },
});
