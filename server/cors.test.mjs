import { test } from "node:test";
import assert from "node:assert/strict";
import { createToolServer } from "./static.mjs";

test("YouTube API exact-origin credentialed CORS and preflight never authenticate", async () => {
  let calls = 0;
  let authCalls = 0;
  const server = createToolServer({
    tool: "youtube-audio",
    dist: ".",
    toolOrigin: "https://tools-youtube-audio.dsub.io",
    parentOrigins: ["https://www.dsub.io"],
    authenticate: async () => {
      authCalls++;
      return "member";
    },
    apiHandler: async (request, { authenticate }) => {
      calls++;
      return Response.json({ subject: await authenticate(request) });
    },
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${server.address().port}`;
  const url = `${base}/api/tools/youtube-audio/resolve`;
  try {
    const preflight = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: "https://tools-youtube-audio.dsub.io",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(
      preflight.headers.get("access-control-allow-origin"),
      "https://tools-youtube-audio.dsub.io",
    );
    assert.equal(
      preflight.headers.get("access-control-allow-credentials"),
      "true",
    );
    assert.equal(
      preflight.headers.get("access-control-allow-methods"),
      "GET, HEAD, POST, DELETE",
    );
    assert.equal(calls, 0);
    assert.equal(authCalls, 0);
    for (const origin of [
      "https://attacker.example",
      "https://www.dsub.io.attacker.example",
      "null",
      "",
    ]) {
      const response = await fetch(url, {
        method: "POST",
        headers: origin ? { Origin: origin } : {},
      });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
    }
    assert.equal(calls, 0);
    assert.equal(authCalls, 0);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Origin: "https://www.dsub.io",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "https://www.dsub.io",
    );
    assert.equal(
      response.headers.get("access-control-allow-credentials"),
      "true",
    );
    assert.equal(response.headers.get("vary"), "Origin");
    assert.match(
      response.headers.get("access-control-expose-headers"),
      /Content-Range/,
    );
    assert.deepEqual(await response.json(), { subject: "member" });
    for (const headers of [
      { "Access-Control-Request-Method": "PATCH" },
      {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "X-Unknown",
      },
    ]) {
      assert.equal(
        (
          await fetch(url, {
            method: "OPTIONS",
            headers: { Origin: "https://www.dsub.io", ...headers },
          })
        ).status,
        403,
      );
    }
    assert.equal(calls, 1);
    assert.equal(authCalls, 1);
  } finally {
    await new Promise((done) => server.close(done));
  }
});
test("other tool servers do not expose YouTube CORS behavior", async () => {
  const server = createToolServer({
    tool: "transcode",
    dist: ".",
    parentOrigins: ["https://www.dsub.io"],
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/tools/youtube-audio/resolve`,
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://www.dsub.io",
          "Access-Control-Request-Method": "POST",
        },
      },
    );
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  } finally {
    await new Promise((done) => server.close(done));
  }
});
