import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createYoutubeAudioHandler } from "./api.mjs";

const prefix = "/api/tools/youtube-audio";
const sourceId = "source_12345678";
const path = `${prefix}/sources/${sourceId}`;
const upstream = {
  contentType: "audio/mp4",
  expiresAt: null,
  fileName: "한글 audio.m4a",
  size: 8,
  title: "Reference",
  url: "https://upstream.invalid/audio",
  videoId: "abcdefghijk",
};
let handle, context, provider, fetcher, now, cancel;

beforeEach(() => {
  now = 1_800_000_000_000;
  cancel = vi.fn();
  provider = { resolve: vi.fn().mockResolvedValue(upstream) };
  fetcher = vi.fn(async (_url, init) => {
    const range = init.headers.get("range");
    const [, start, end] = /bytes=(\d+)-(\d+)/.exec(range);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(Number(end) - Number(start) + 1));
      },
      cancel,
    });
    return new Response(stream, {
      status: 206,
      headers: { "Content-Range": `bytes ${start}-${end}/8` },
    });
  });
  context = { authenticate: vi.fn().mockResolvedValue("user-a") };
  handle = createYoutubeAudioHandler({
    provider,
    fetch: fetcher,
    now: () => now,
    createSourceId: () => sourceId,
  });
});
afterEach(() => {
  vi.useRealTimers();
});
function request(pathname, options = {}) {
  return new Request(`http://mini.invalid${pathname}`, options);
}
async function resolve() {
  return handle(
    request(`${prefix}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://youtu.be/abcdefghijk" }),
    }),
    context,
  );
}

describe("standalone YouTube audio API", () => {
  it("returns an opaque relative source descriptor without upstream URL or headers", async () => {
    const response = await resolve();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      sourceId,
      title: "Reference",
      input: { http: { url: path, credentials: "include", size: 8 } },
    });
    expect(context.authenticate).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("requires authentication for resolve and every source method", async () => {
    context.authenticate.mockResolvedValue(null);
    expect((await resolve()).status).toBe(401);
    for (const method of ["GET", "HEAD", "DELETE"]) {
      const response = await handle(request(path, { method }), context);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "UNAUTHORIZED" });
    }
    expect(context.authenticate).toHaveBeenCalledTimes(4);
    expect(provider.resolve).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    new Error("Private Oathkeeper connection detail"),
    new DOMException("Private verifier timeout", "TimeoutError"),
  ])(
    "reports authentication verifier failures as unavailable without exposing details",
    async (error) => {
      context.authenticate.mockRejectedValue(error);
      const response = await resolve();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "INTERNAL_ERROR" });
      for (const method of ["GET", "HEAD", "DELETE"]) {
        const response = await handle(request(path, { method }), context);
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "INTERNAL_ERROR" });
      }
      expect(provider.resolve).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("rejects foreign ownership before fetching or revoking", async () => {
    await resolve();
    context.authenticate.mockResolvedValue("user-b");
    for (const method of ["GET", "HEAD", "DELETE"])
      expect((await handle(request(path, { method }), context)).status).toBe(
        403,
      );
    expect(fetcher).not.toHaveBeenCalled();
    context.authenticate.mockResolvedValue("user-a");
    expect(
      (
        await handle(
          request(path, { headers: { Range: "bytes=0-3" } }),
          context,
        )
      ).status,
    ).toBe(206);
  });
  it("streams complete downloads with Unicode filename and exact byte length", async () => {
    await resolve();
    const response = await handle(request(`${path}?download=1`), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("8");
    expect(response.headers.get("content-range")).toBeNull();
    expect(response.headers.get("content-disposition")).toContain(
      "filename*=UTF-8''%ED%95%9C%EA%B8%80%20audio.m4a",
    );
    expect(fetcher.mock.calls[0][1].headers.get("range")).toBe("bytes=0-7");
    await response.body.cancel();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("preserves closed Range requests and expands open resume ranges", async () => {
    await resolve();
    for (const [range, expected] of [
      ["bytes=2-4", "bytes 2-4/8"],
      ["bytes=3-", "bytes 3-7/8"],
    ]) {
      const response = await handle(
        request(`${path}?download=1`, { headers: { Range: range } }),
        context,
      );
      expect(response.status).toBe(206);
      expect(response.headers.get("content-range")).toBe(expected);
      await response.body.cancel();
    }
  });
  it("performs a one-byte HEAD availability preflight and cancels upstream body", async () => {
    await resolve();
    const response = await handle(
      request(`${path}?download=1`, { method: "HEAD" }),
      context,
    );
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get("content-length")).toBe("8");
    expect(response.headers.get("content-type")).toBe("audio/mp4");
    expect(fetcher.mock.calls[0][1].headers.get("range")).toBe("bytes=0-0");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("reports expiration and supports authenticated deletion", async () => {
    await resolve();
    now += 600_001;
    const response = await handle(request(path), context);
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: "SOURCE_EXPIRED" });
    expect(fetcher).not.toHaveBeenCalled();
    await resolve();
    expect(
      (await handle(request(path, { method: "DELETE" }), context)).status,
    ).toBe(204);
    expect((await handle(request(path), context)).status).toBe(404);
  });
  it.each(["bytes=8-9", "bytes=0-1,3-4", "bytes=-3"])(
    "rejects invalid or unsupported range %s",
    async (range) => {
      await resolve();
      expect(
        (await handle(request(path, { headers: { Range: range } }), context))
          .status,
      ).toBe(400);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("rejects unexpected upstream range responses without exposing details", async () => {
    await resolve();
    fetcher.mockResolvedValueOnce(
      new Response("private upstream details", { status: 200 }),
    );
    const response = await handle(
      request(path, { headers: { Range: "bytes=0-1" } }),
      context,
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "INVALID_UPSTREAM_RESPONSE",
    });
  });
  it.each([
    ["application/json", "{", 400],
    ["application/json", '{"url":4}', 400],
    ["text/plain", "{}", 415],
    [
      "application/json",
      JSON.stringify({ url: "https://example.com/private" }),
      400,
    ],
    ["application/json", JSON.stringify({ url: "x".repeat(17_000) }), 400],
  ])(
    "validates request JSON/type/URL/body size",
    async (contentType, body, status) => {
      const response = await handle(
        request(`${prefix}/resolve`, {
          method: "POST",
          headers: { "Content-Type": contentType },
          body,
        }),
        context,
      );
      expect(response.status).toBe(status);
      expect(provider.resolve).not.toHaveBeenCalled();
    },
  );
  it("bounds a stalled provider resolve and distinguishes the deadline from caller cancellation", async () => {
    vi.useFakeTimers();
    let providerSignal;
    provider.resolve.mockImplementation((_video, signal) => {
      providerSignal = signal;
      return new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      );
    });
    handle = createYoutubeAudioHandler({
      provider,
      fetch: fetcher,
      resolveTimeoutMs: 20,
    });
    const pending = resolve();
    await vi.advanceTimersByTimeAsync(20);
    const response = await pending;
    expect(providerSignal.aborted).toBe(true);
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: "UPSTREAM_FAILURE" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves incoming cancellation during provider resolution and clears its timer", async () => {
    vi.useFakeTimers();
    provider.resolve.mockImplementation(
      (_video, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          }),
        ),
    );
    const controller = new AbortController();
    const pending = handle(
      request(`${prefix}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://youtu.be/abcdefghijk" }),
        signal: controller.signal,
      }),
      context,
    );
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    const response = await pending;
    expect(response.status).toBe(408);
    expect(await response.json()).toEqual({ error: "REQUEST_ABORTED" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["HEAD", "GET"])(
    "bounds stalled upstream %s headers",
    async (method) => {
      vi.useFakeTimers();
      handle = createYoutubeAudioHandler({
        provider,
        fetch: fetcher,
        createSourceId: () => sourceId,
        sourceHeaderTimeoutMs: 20,
      });
      await resolve();
      let upstreamSignal;
      fetcher.mockImplementation((_url, { signal }) => {
        upstreamSignal = signal;
        return new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          }),
        );
      });
      const pending = handle(request(path, { method }), context);
      await vi.advanceTimersByTimeAsync(20);
      const response = await pending;
      expect(upstreamSignal.aborted).toBe(true);
      expect(response.status).toBe(504);
      expect(await response.json()).toEqual({ error: "UPSTREAM_FAILURE" });
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("clears the header deadline while allowing audio to continue streaming", async () => {
    vi.useFakeTimers();
    handle = createYoutubeAudioHandler({
      provider,
      fetch: fetcher,
      createSourceId: () => sourceId,
      sourceHeaderTimeoutMs: 20,
    });
    await resolve();
    let upstreamSignal, streamController;
    fetcher.mockImplementation((_url, { signal }) => {
      upstreamSignal = signal;
      const stream = new ReadableStream({
        start(controller) {
          streamController = controller;
          controller.enqueue(new Uint8Array([1, 2, 3, 4]));
        },
      });
      return new Response(stream, {
        status: 206,
        headers: { "Content-Range": "bytes 0-7/8" },
      });
    });
    const response = await handle(request(path), context);
    const reader = response.body.getReader();
    expect(Array.from((await reader.read()).value)).toEqual([1, 2, 3, 4]);
    await vi.advanceTimersByTimeAsync(100);
    expect(upstreamSignal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    streamController.enqueue(new Uint8Array([5, 6, 7, 8]));
    streamController.close();
    expect(Array.from((await reader.read()).value)).toEqual([5, 6, 7, 8]);
    expect((await reader.read()).done).toBe(true);
  });

  it("preserves caller cancellation while waiting for headers and after streaming starts", async () => {
    vi.useFakeTimers();
    await resolve();
    const controller = new AbortController();
    let upstreamSignal;
    fetcher.mockImplementation((_url, { signal }) => {
      upstreamSignal = signal;
      return new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      );
    });
    const pending = handle(
      request(path, { signal: controller.signal }),
      context,
    );
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect((await pending).status).toBe(408);
    expect(upstreamSignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    const streamingCaller = new AbortController();
    fetcher.mockImplementation((_url, { signal }) => {
      upstreamSignal = signal;
      const stream = new ReadableStream({
        start(controller) {
          signal.addEventListener(
            "abort",
            () => controller.error(signal.reason),
            { once: true },
          );
        },
      });
      return new Response(stream, {
        status: 206,
        headers: { "Content-Range": "bytes 0-7/8" },
      });
    });
    const response = await handle(
      request(path, { signal: streamingCaller.signal }),
      context,
    );
    streamingCaller.abort();
    expect(upstreamSignal.aborted).toBe(true);
    await expect(response.body.getReader().read()).rejects.toThrow();
  });

  it("returns null outside its routes and method allowances inside", async () => {
    expect(await handle(request("/unrelated"), context)).toBeNull();
    expect(context.authenticate).not.toHaveBeenCalled();
    const response = await handle(request(`${prefix}/resolve`), context);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });
});
