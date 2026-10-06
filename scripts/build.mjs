import { build } from "vite";
import { fileURLToPath } from "node:url";
import { toolArgument } from "./tools.mjs";
const tool = toolArgument();
if (tool === "hwp") {
  const { prepareHwpRuntime } =
    await import("../apps/hwp/scripts/prepare-hwp-runtime.mjs");
  await prepareHwpRuntime();
}
const root = fileURLToPath(new URL(`../apps/${tool}/`, import.meta.url));
await build({
  configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
  root,
  build: { outDir: "dist", emptyOutDir: true },
});
