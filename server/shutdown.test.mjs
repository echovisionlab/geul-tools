import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

test("SIGTERM drains an in-flight streamed request before exiting", async () => {
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { createToolServer } from './server/static.mjs';
    import { drainOnSignal } from './server/shutdown.mjs';
    const server = createToolServer({ tool: 'youtube-audio', dist: '.', parentOrigins: [], apiHandler: async () => {
      console.log('started');
      await new Promise((done) => setTimeout(done, 300));
      return new Response('finished');
    } });
    server.listen(0, '127.0.0.1', () => console.log(server.address().port));
    drainOnSignal(server);
  `,
    ],
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const exited = once(child, "exit");
  const line = () =>
    new Promise((resolve) =>
      child.stdout.once("data", (chunk) => resolve(chunk.toString().trim())),
    );
  try {
    const port = await line();
    const started = line();
    const response = fetch(`http://127.0.0.1:${port}/api/inflight`);
    assert.equal(await started, "started");
    child.kill("SIGTERM");
    assert.equal(await (await response).text(), "finished");
    assert.deepEqual(await exited, [0, null]);
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  }
});
