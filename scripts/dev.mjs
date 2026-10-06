import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import {
  runtimeConfigScript,
  configuredParentOrigins,
} from "../server/static.mjs";
import { toolArgument } from "./tools.mjs";
const tool = toolArgument();
const server = await createServer({
  configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
  root: fileURLToPath(new URL(`../apps/${tool}/`, import.meta.url)),
  plugins: [
    {
      name: "tool-runtime-config",
      configureServer(vite) {
        vite.middlewares.use("/runtime-config.js", (_request, response) => {
          response.setHeader("Content-Type", "text/javascript; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(
            runtimeConfigScript({
              tool,
              parentOrigins: configuredParentOrigins(),
            }),
          );
        });
      },
    },
  ],
});
await server.listen();
server.printUrls();
