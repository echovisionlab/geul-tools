import {
  createMemoryYoutubeAudioSourceStore,
  createYoutubeAudioService,
  YoutubeAudioError,
} from "@echovisionlab/youtube-audio";
import { createYoutubeJsAudioProvider } from "@echovisionlab/youtube-audio/youtube-js";

const prefix = "/api/tools/youtube-audio";
const noStore = { "Cache-Control": "private, no-store, max-age=0" };
const maximumResolveBytes = 16 * 1024;

/** One service and short-lived source store per server process. */
export function createYoutubeAudioHandler(options = {}) {
  const now = options.now ?? Date.now;
  const sourceStore =
    options.sourceStore ??
    createMemoryYoutubeAudioSourceStore({ now: options.now });
  const service = createYoutubeAudioService({
    provider: options.provider ?? createYoutubeJsAudioProvider(),
    sourceStore,
    makeSourceUrl: (id) =>
      `http://youtube-audio.invalid${prefix}/sources/${encodeURIComponent(id)}`,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.now ? { now: options.now } : {}),
    ...(options.createSourceId
      ? { createSourceId: options.createSourceId }
      : {}),
    ...(options.sourceTtlMs ? { sourceTtlMs: options.sourceTtlMs } : {}),
  });

  return async function handleRequest(request, context) {
    const url = new URL(request.url);
    const sourceMatch = new RegExp(`^${prefix}/sources/([^/]+)$`).exec(
      url.pathname,
    );
    if (url.pathname !== `${prefix}/resolve` && sourceMatch === null)
      return null;
    let subject;
    try {
      subject = await context.authenticate(request);
    } catch {
      return jsonError("INTERNAL_ERROR", 503);
    }
    if (!subject) return jsonError("UNAUTHORIZED", 401);
    try {
      if (url.pathname === `${prefix}/resolve`) {
        if (request.method !== "POST") return methodNotAllowed("POST");
        if (
          request.headers
            .get("content-type")
            ?.split(";")[0]
            .trim()
            .toLowerCase() !== "application/json"
        )
          return jsonError("INVALID_REQUEST", 415);
        const body = await readResolveBody(request);
        if (typeof body?.url !== "string")
          return jsonError("INVALID_REQUEST", 400);
        const resolved = await withUpstreamDeadline(
          request.signal,
          options.resolveTimeoutMs ?? 30_000,
          (signal) => service.resolve({ url: body.url, subject, signal }),
        );
        return Response.json(
          {
            ...resolved,
            input: {
              ...resolved.input,
              http: {
                ...resolved.input.http,
                url: `${prefix}/sources/${encodeURIComponent(resolved.sourceId)}`,
              },
            },
          },
          { headers: noStore },
        );
      }
      const sourceId = decodeURIComponent(sourceMatch[1]);
      if (request.method === "DELETE") {
        await service.revoke({ sourceId, subject });
        return new Response(null, { status: 204, headers: noStore });
      }
      if (request.method !== "GET" && request.method !== "HEAD")
        return methodNotAllowed("GET, HEAD, DELETE");
      // Only stored YouTube sources are accepted; the caller cannot supply an upstream URL.
      const record = await sourceStore.get(sourceId);
      if (record && record.subject !== subject)
        return jsonError("UNAUTHORIZED", 403);
      if (record && record.expiresAt <= now()) {
        await sourceStore.delete(sourceId);
        return jsonError("SOURCE_EXPIRED", 410);
      }
      const browserRange = request.headers.get("range");
      const size = record?.upstream.size;
      const range =
        request.method === "HEAD"
          ? "bytes=0-0"
          : browserRange === null
            ? `bytes=0-${size - 1}`
            : browserRange.replace(/^(bytes=\d+)-$/, `$1-${size - 1}`);
      // Stop the header deadline as soon as the upstream response is validated.
      // The composed signal still forwards browser cancellation during streaming.
      const response = await withUpstreamDeadline(
        request.signal,
        options.sourceHeaderTimeoutMs ?? 15_000,
        (signal) => service.read({ range, sourceId, subject, signal }),
      );
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", noStore["Cache-Control"]);
      headers.set("X-Content-Type-Options", "nosniff");
      if (url.searchParams.get("download") === "1") {
        const fileName = record.upstream.fileName
          .toWellFormed()
          .replace(/[\r\n]/g, "");
        const encoded = encodeURIComponent(fileName).replace(
          /['()*]/g,
          (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
        );
        headers.set(
          "Content-Disposition",
          `attachment; filename="audio"; filename*=UTF-8''${encoded}`,
        );
      }
      if (request.method === "HEAD") {
        await response.body?.cancel();
        headers.delete("Content-Range");
        headers.set("Content-Length", String(size));
        return new Response(null, { headers, status: 200 });
      }
      if (browserRange === null) headers.delete("Content-Range");
      return new Response(response.body, {
        headers,
        status: browserRange === null ? 200 : 206,
      });
    } catch (error) {
      if (error instanceof UpstreamDeadlineError)
        return jsonError("UPSTREAM_FAILURE", 504);
      if (error instanceof YoutubeAudioError)
        return jsonError(error.code, statusForCode(error.code));
      if (error instanceof SyntaxError || error instanceof URIError)
        return jsonError("INVALID_REQUEST", 400);
      if (request.signal.aborted) return jsonError("REQUEST_ABORTED", 408);
      return jsonError("INTERNAL_ERROR", 500);
    }
  };
}

class UpstreamDeadlineError extends Error {}

async function withUpstreamDeadline(incomingSignal, timeoutMs, operation) {
  const deadline = new AbortController();
  const signal = AbortSignal.any([incomingSignal, deadline.signal]);
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  try {
    return await operation(signal);
  } catch (error) {
    if (deadline.signal.aborted && !incomingSignal.aborted)
      throw new UpstreamDeadlineError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readResolveBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing request body");
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumResolveBytes) {
        await reader.cancel();
        throw new YoutubeAudioError(
          "INVALID_REQUEST",
          "Resolve request exceeds the size limit.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
function jsonError(error, status) {
  return Response.json({ error }, { status, headers: noStore });
}
function methodNotAllowed(allow) {
  return Response.json(
    { error: "INVALID_REQUEST" },
    { status: 405, headers: { ...noStore, Allow: allow } },
  );
}
function statusForCode(code) {
  return {
    INVALID_REQUEST: 400,
    UNAUTHORIZED: 403,
    SOURCE_NOT_FOUND: 404,
    SOURCE_EXPIRED: 410,
    UNSUPPORTED_VIDEO: 422,
    REQUEST_ABORTED: 408,
    INVALID_UPSTREAM_RESPONSE: 502,
    UPSTREAM_FAILURE: 502,
  }[code];
}
export const handleRequest = createYoutubeAudioHandler();
