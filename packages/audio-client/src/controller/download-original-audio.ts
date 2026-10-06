/** Validate the short-lived source, then let the browser download without a JS-owned file buffer. */
export async function downloadOriginalAudio(
  url: string,
  name: string,
  signal: AbortSignal,
  apiOrigin?: string,
): Promise<"started" | "expired" | "failed"> {
  const source = new URL(url, window.location.href);
  const sameOrigin = source.origin === window.location.origin;
  if (!sameOrigin && source.origin !== apiOrigin) {
    return "failed";
  }
  const response = await fetch(source.href, {
    method: "HEAD",
    credentials: sameOrigin ? "same-origin" : "include",
    cache: "no-store",
    signal,
  });
  signal.throwIfAborted();
  if (response.status === 404 || response.status === 410) {
    return "expired";
  }
  if (!response.ok) {
    return "failed";
  }
  const link = document.createElement("a");
  link.href = source.href;
  link.download = name;
  // A late upstream failure must not replace the converter page with an API error.
  link.target = "_blank";
  link.rel = "noopener";
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
  }
  return "started";
}
