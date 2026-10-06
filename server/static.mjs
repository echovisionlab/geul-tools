import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
};

export function configuredParentOrigins(
  value = process.env.EMBED_PARENT_ORIGINS ?? "https://www.dsub.io",
) {
  return [
    ...new Set(
      value.split(",").map((entry) => {
        const url = new URL(entry.trim());
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.pathname !== "/" ||
          url.search ||
          url.hash
        )
          throw new Error(
            "EMBED_PARENT_ORIGINS must contain comma-separated HTTP(S) origins.",
          );
        return url.origin;
      }),
    ),
  ];
}
export function runtimeConfigScript({
  tool,
  parentOrigins,
  fontCdnOrigin = process.env.FONT_CDN_ORIGIN ?? "https://cdn.dsub.io",
  apiOrigin = process.env.PUBLIC_API_ORIGIN,
}) {
  return `window.__GEUL_TOOL_CONFIG__=${JSON.stringify({ tool, parentOrigins, fontCdnOrigin, apiOrigin }).replace(/</g, "\\u003c")};\n`;
}
export function securityHeaders(parentOrigins) {
  return {
    "Content-Security-Policy": `frame-ancestors 'self' ${parentOrigins.join(" ")}; object-src 'none'; base-uri 'self'`,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), geolocation=(), display-capture=()",
  };
}

export function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end = match[1]
    ? match[2]
      ? Math.min(Number(match[2]), size - 1)
      : size - 1
    : size - 1;
  return Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    start <= end &&
    start < size
    ? { start, end }
    : null;
}

export async function staticResponse(request, { dist, tool, parentOrigins }) {
  const url = new URL(request.url);
  if (url.pathname === "/healthz")
    return new Response("ok\n", { headers: { "Cache-Control": "no-store" } });
  if (!["GET", "HEAD"].includes(request.method))
    return new Response("Method not allowed\n", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  if (url.pathname === "/runtime-config.js")
    return new Response(
      request.method === "HEAD"
        ? null
        : runtimeConfigScript({ tool, parentOrigins }),
      {
        headers: {
          "Content-Type": "text/javascript; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response("Bad path\n", { status: 400 });
  }
  if (
    pathname.includes("\0") ||
    pathname.includes("\\") ||
    pathname.split("/").includes("..")
  )
    return new Response("Not found\n", { status: 404 });
  const root = await realpath(dist);
  const candidate = resolve(
    root,
    `.${pathname === "/" ? "/index.html" : pathname}`,
  );
  if (!candidate.startsWith(`${root}${sep}`))
    return new Response("Not found\n", { status: 404 });
  let file, metadata;
  try {
    file = await realpath(candidate);
    metadata = await stat(file);
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code))
      return new Response("Not found\n", { status: 404 });
    throw error;
  }
  if (!file.startsWith(`${root}${sep}`) || !metadata.isFile())
    return new Response("Not found\n", { status: 404 });
  const headers = {
    "Content-Type": mimeTypes[extname(file)] ?? "application/octet-stream",
    "Content-Length": String(metadata.size),
    "Accept-Ranges": "bytes",
    "Cache-Control":
      /\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9]+$/.test(file) ||
      /-[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9]+$/.test(file)
        ? "public, max-age=31536000, immutable"
        : "no-store",
  };
  let status = 200;
  let range;
  if (request.headers.has("range")) {
    range = parseRange(request.headers.get("range"), metadata.size);
    if (!range)
      return new Response(null, {
        status: 416,
        headers: {
          ...headers,
          "Content-Range": `bytes */${metadata.size}`,
          "Content-Length": "0",
        },
      });
    status = 206;
    headers["Content-Range"] =
      `bytes ${range.start}-${range.end}/${metadata.size}`;
    headers["Content-Length"] = String(range.end - range.start + 1);
  }
  return new Response(
    request.method === "HEAD"
      ? null
      : Readable.toWeb(createReadStream(file, range ?? {})),
    { status, headers },
  );
}

const youtubeApiPrefix = "/api/tools/youtube-audio";
const apiMethods = ["GET", "HEAD", "POST", "DELETE"];
const apiRequestHeaders = ["content-type", "range"];

export function apiOriginPolicy(request, { tool, toolOrigin, parentOrigins }) {
  const pathname = new URL(request.url).pathname;
  if (
    tool !== "youtube-audio" ||
    (pathname !== youtubeApiPrefix &&
      !pathname.startsWith(`${youtubeApiPrefix}/`))
  )
    return null;
  const origin = request.headers.get("origin");
  const allowed =
    origin &&
    [toolOrigin ?? new URL(request.url).origin, ...parentOrigins].includes(
      origin,
    );
  if (
    (origin && !allowed) ||
    (!origin && !["GET", "HEAD"].includes(request.method))
  ) {
    return {
      response: new Response("Forbidden origin\n", {
        status: 403,
        headers: { "Cache-Control": "no-store", Vary: "Origin" },
      }),
      headers: {},
    };
  }
  const headers = allowed
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Expose-Headers":
          "Content-Type, Content-Length, Content-Range, Accept-Ranges, Content-Disposition",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
  if (request.method === "OPTIONS") {
    const method = request.headers.get("access-control-request-method");
    const requestedHeaders = (
      request.headers.get("access-control-request-headers") ?? ""
    )
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (
      !apiMethods.includes(method) ||
      requestedHeaders.some((header) => !apiRequestHeaders.includes(header))
    ) {
      return { response: new Response(null, { status: 403 }), headers };
    }
    return {
      response: new Response(null, { status: 204 }),
      headers: {
        ...headers,
        "Access-Control-Allow-Methods": apiMethods.join(", "),
        "Access-Control-Allow-Headers": apiRequestHeaders.join(", "),
        "Cache-Control": "no-store",
      },
    };
  }
  return { response: null, headers };
}

export function createToolServer({
  tool,
  dist,
  parentOrigins = configuredParentOrigins(),
  apiHandler,
  authenticate,
  toolOrigin = process.env.TOOL_ORIGIN,
}) {
  return createServer(async (incoming, outgoing) => {
    let originPolicy;
    try {
      const abort = new AbortController();
      incoming.on("aborted", () => abort.abort());
      const request = new Request(
        `http://${incoming.headers.host ?? "localhost"}${incoming.url}`,
        {
          method: incoming.method,
          headers: incoming.headers,
          signal: abort.signal,
          ...(!["GET", "HEAD"].includes(incoming.method)
            ? { body: Readable.toWeb(incoming), duplex: "half" }
            : {}),
        },
      );
      originPolicy = apiOriginPolicy(request, {
        tool,
        toolOrigin,
        parentOrigins,
      });
      const response =
        originPolicy?.response ??
        (apiHandler ? await apiHandler(request, { authenticate }) : null) ??
        (await staticResponse(request, { tool, dist, parentOrigins }));
      response.headers.forEach((value, key) => outgoing.setHeader(key, value));
      for (const [key, value] of Object.entries(originPolicy?.headers ?? {}))
        outgoing.setHeader(key, value);
      for (const [key, value] of Object.entries(securityHeaders(parentOrigins)))
        outgoing.setHeader(key, value);
      outgoing.statusCode = response.status;
      if (response.body && incoming.method !== "HEAD")
        await pipeline(Readable.fromWeb(response.body), outgoing);
      else outgoing.end();
    } catch (error) {
      if (outgoing.headersSent) {
        outgoing.destroy();
        return;
      }
      console.error("Tool request failed:", error);
      outgoing.writeHead(500, {
        ...securityHeaders(parentOrigins),
        ...(originPolicy?.headers ?? {}),
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      outgoing.end("Internal server error\n");
    }
  });
}
