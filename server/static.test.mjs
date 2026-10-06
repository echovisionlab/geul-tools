import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createToolServer,
  configuredParentOrigins,
  runtimeConfigScript,
} from "./static.mjs";

await mkdir(".artifacts", { recursive: true });
const directory = await mkdtemp(resolve(".artifacts", "http-test-"));
const dist = resolve(directory, "dist");
await mkdir(resolve(dist, "assets"), { recursive: true });
await writeFile(resolve(dist, "index.html"), "<h1>Tool</h1>");
await writeFile(
  resolve(dist, "assets/main-Abc12345.js"),
  "export const value=1;",
);
await writeFile(
  resolve(dist, "runtime.wasm"),
  Buffer.from([0, 97, 115, 109, 1, 2, 3, 4]),
);
await writeFile(resolve(directory, "secret.txt"), "outside");
await symlink(resolve(directory, "secret.txt"), resolve(dist, "link.txt"));
const parentOrigins = ["https://www.dsub.io", "https://preview.dsub.io"];
const server = createToolServer({ tool: "transcode", dist, parentOrigins });
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
after(async () => {
  await new Promise((done) => server.close(done));
  await rm(directory, { recursive: true, force: true });
});

test("runtime config exposes the selected public API origin", () => {
  assert.match(
    runtimeConfigScript({
      tool: "youtube-audio",
      parentOrigins: ["https://www.dsub.io"],
      apiOrigin: "https://www.dsub.io",
    }),
    /"apiOrigin":"https:\/\/www.dsub.io"/,
  );
});

test("serves isolated index/config with matching framing policy and no secrets", async () => {
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal(page.headers.get("x-frame-options"), null);
  assert.equal(
    page.headers.get("content-security-policy"),
    "frame-ancestors 'self' https://www.dsub.io https://preview.dsub.io; object-src 'none'; base-uri 'self'",
  );
  assert.equal(await page.text(), "<h1>Tool</h1>");
  const config = await fetch(`${origin}/runtime-config.js`);
  assert.equal(config.headers.get("cache-control"), "no-store");
  assert.match(
    await config.text(),
    /"tool":"transcode","parentOrigins":\["https:\/\/www.dsub.io","https:\/\/preview.dsub.io"\]/,
  );
  assert.equal((await fetch(`${origin}/healthz`)).status, 200);
});
test("serves fingerprinted assets, WASM MIME, Range and HEAD", async () => {
  const asset = await fetch(`${origin}/assets/main-Abc12345.js`);
  assert.equal(
    asset.headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  );
  const range = await fetch(`${origin}/runtime.wasm`, {
    headers: { Range: "bytes=2-4" },
  });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-type"), "application/wasm");
  assert.equal(range.headers.get("content-range"), "bytes 2-4/8");
  assert.deepEqual(
    new Uint8Array(await range.arrayBuffer()),
    Uint8Array.from([115, 109, 1]),
  );
  const head = await fetch(`${origin}/runtime.wasm`, { method: "HEAD" });
  assert.equal(head.headers.get("content-length"), "8");
  assert.equal(await head.text(), "");
  assert.equal(
    (await fetch(`${origin}/runtime.wasm`, { headers: { Range: "bytes=99-" } }))
      .status,
    416,
  );
});
test("rejects traversal, external symlinks, absent assets, and invalid configured origins", async () => {
  for (const path of ["/..%2fsecret.txt", "/link.txt", "/missing.js"])
    assert.equal((await fetch(`${origin}${path}`)).status, 404);
  assert.throws(() => configuredParentOrigins("https://www.dsub.io/path"));
  assert.throws(() => configuredParentOrigins("https://user@www.dsub.io"));
});
test("passes standard Request and authentication dependency through API extension", async () => {
  const authenticate = async () => "user-1";
  const api = createToolServer({
    tool: "youtube-audio",
    dist,
    parentOrigins,
    authenticate,
    apiHandler: async (request, context) =>
      new URL(request.url).pathname === "/api/check"
        ? Response.json({
            subject: await context.authenticate(request),
            body: await request.text(),
          })
        : null,
  });
  await new Promise((done) => api.listen(0, "127.0.0.1", done));
  try {
    const response = await fetch(
      `http://127.0.0.1:${api.address().port}/api/check`,
      { method: "POST", body: "content" },
    );
    assert.deepEqual(await response.json(), {
      subject: "user-1",
      body: "content",
    });
  } finally {
    await new Promise((done) => api.close(done));
  }
});
