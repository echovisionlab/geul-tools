import { build } from "vite";
import { existsSync } from "node:fs";
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
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: true,
    cssMinify: true,
    sourcemap: false,
  },
});
if (existsSync(`${root}src/embed.tsx`)) {
  await build({
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    root,
    base: "./",
    publicDir: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      outDir: "dist/embed",
      emptyOutDir: true,
      minify: true,
      cssMinify: true,
      sourcemap: false,
      rolldownOptions: { output: { minify: true } },
      lib: {
        entry: `${root}src/embed.tsx`,
        formats: ["es"],
        fileName: "index",
        cssFileName: "style",
      },
    },
  });
}
