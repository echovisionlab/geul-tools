import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthenticator } from "./auth.mjs";

const session = {
  onboarded: true,
  member: { status: "ACCOUNT_STATUS_ACTIVE", summary: { id: "member-1" } },
};
const request = (cookie) =>
  new Request("https://www.dsub.io/api/tools/youtube-audio/resolve", {
    headers: cookie ? { cookie } : {},
  });
test("session validation forwards only the named cookie and rechecks every request", async () => {
  let calls = 0;
  const authenticate = createAuthenticator({
    oathkeeperUrl: "http://oathkeeper:4455",
    cookieName: "__Host-dsub-session",
    fetcher: async (url, options) => {
      calls += 1;
      assert.equal(
        url.href,
        "http://oathkeeper:4455/api/rpc/api.manage.v1.MemberService/GetCurrentSession",
      );
      assert.equal(options.method, "POST");
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.equal(options.headers["Connect-Protocol-Version"], "1");
      assert.equal(options.body, "{}");
      assert.equal(options.headers.Cookie, "__Host-dsub-session=test-session");
      assert.equal(options.redirect, "error");
      return Response.json(
        calls === 1
          ? session
          : {
              ...session,
              member: { ...session.member, status: "ACCOUNT_STATUS_BANNED" },
            },
      );
    },
  });
  assert.equal(
    await authenticate(
      request("unrelated=ignored; __Host-dsub-session=test-session"),
    ),
    "member-1",
  );
  assert.equal(
    await authenticate(request("__Host-dsub-session=test-session")),
    null,
  );
  assert.equal(calls, 2);
});
test("absent, duplicate and empty session cookies never reach the auth service", async () => {
  const authenticate = createAuthenticator({
    oathkeeperUrl: "http://oathkeeper:4455",
    cookieName: "session",
    fetcher: async () => {
      throw new Error("must not call");
    },
  });
  for (const cookie of [null, "session=", "session=a; session=b", "other=a"])
    assert.equal(await authenticate(request(cookie)), null);
});
test("expired sessions and incomplete projections fail closed; upstream failures surface", async () => {
  for (const payload of [
    { onboarded: false, member: session.member },
    {},
    {
      ...session,
      member: { status: "ACCOUNT_STATUS_DELETED", summary: { id: "member-1" } },
    },
  ]) {
    const authenticate = createAuthenticator({
      oathkeeperUrl: "http://oathkeeper:4455",
      cookieName: "session",
      fetcher: async () => Response.json(payload),
    });
    assert.equal(await authenticate(request("session=fake")), null);
  }
  for (const status of [401, 403]) {
    const authenticate = createAuthenticator({
      oathkeeperUrl: "http://oathkeeper:4455",
      cookieName: "session",
      fetcher: async () => new Response("", { status }),
    });
    assert.equal(await authenticate(request("session=fake")), null);
  }
  const unavailable = createAuthenticator({
    oathkeeperUrl: "http://oathkeeper:4455",
    cookieName: "session",
    fetcher: async () => new Response("", { status: 503 }),
  });
  await assert.rejects(
    unavailable(request("session=fake")),
    /Session validation failed/,
  );
});

test("only the active protobuf JSON enum authorizes a complete member", async () => {
  for (const status of [
    "ACCOUNT_STATUS_UNSPECIFIED",
    "ACCOUNT_STATUS_BANNED",
    "ACCOUNT_STATUS_DELETED",
    "ACTIVE",
    1,
  ]) {
    const authenticate = createAuthenticator({
      oathkeeperUrl: "http://oathkeeper:4455",
      cookieName: "session",
      fetcher: async () =>
        Response.json({ ...session, member: { ...session.member, status } }),
    });
    assert.equal(await authenticate(request("session=fake")), null);
  }
});

test("session service timeout and transport rejection surface without authorizing", async (t) => {
  const timeout = new DOMException("Session service timed out", "TimeoutError");
  t.mock.method(AbortSignal, "timeout", (milliseconds) => {
    assert.equal(milliseconds, 10000);
    return AbortSignal.abort(timeout);
  });
  const authenticate = createAuthenticator({
    oathkeeperUrl: "http://oathkeeper:4455",
    cookieName: "session",
    fetcher: async (_url, { signal }) => signal.throwIfAborted(),
  });
  await assert.rejects(
    authenticate(request("session=fake")),
    (error) => error === timeout,
  );
  const unavailable = createAuthenticator({
    oathkeeperUrl: "http://oathkeeper:4455",
    cookieName: "session",
    fetcher: async () => {
      throw new TypeError("fetch failed");
    },
  });
  await assert.rejects(unavailable(request("session=fake")), /fetch failed/);
});
