import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL(".", import.meta.url));
export const aliases = {
  "@/shared": `${root}shared`,
  "@/components": `${root}shared/components`,
  "@/lib": `${root}shared/lib`,
  "@/messages": `${root}shared/messages`,
  "@/audio-client": `${root}packages/audio-client/src`,
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias: aliases },
});
