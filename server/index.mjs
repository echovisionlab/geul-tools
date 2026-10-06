import { fileURLToPath } from "node:url";
import { createToolServer, configuredParentOrigins } from "./static.mjs";
import { drainOnSignal } from "./shutdown.mjs";
import { toolArgument } from "../scripts/tools.mjs";
const tool = toolArgument();
let apiHandler, authenticate;
if (tool === "youtube-audio") {
  ({ handleRequest: apiHandler } =
    await import("../apps/youtube-audio/server/api.mjs"));
  ({ authenticate } = await import("./auth.mjs"));
}
const server = createToolServer({
  tool,
  dist: fileURLToPath(new URL(`../apps/${tool}/dist/`, import.meta.url)),
  parentOrigins: configuredParentOrigins(),
  apiHandler,
  authenticate,
});
server.listen(Number(process.env.PORT ?? 8080), "0.0.0.0", () =>
  console.log(`${tool} listening on ${server.address().port}`),
);

drainOnSignal(server);
