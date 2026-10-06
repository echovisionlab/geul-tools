import { describe, expect, it, vi } from "vitest";
import { readEmbedInit, sendEmbedResize } from "./embed";

describe("common Embed bridge", () => {
  const parent = {} as Window;
  const data = { type: "geul:embed:init", locale: "ko", colorScheme: "dark" };
  const event = (
    origin: string,
    source: unknown = parent,
    value: unknown = data,
  ) => ({ origin, source, data: value }) as MessageEvent;
  it("accepts settings only from the exact allowed parent origin and window", () => {
    expect(
      readEmbedInit(event("https://www.dsub.io"), parent, [
        "https://www.dsub.io",
      ]),
    ).toEqual({ locale: "ko", colorScheme: "dark" });
    for (const origin of [
      "null",
      "https://www.dsub.io.attacker.example",
      "http://www.dsub.io",
      "https://other.dsub.io",
    ])
      expect(
        readEmbedInit(event(origin), parent, ["https://www.dsub.io"]),
      ).toBeNull();
    expect(
      readEmbedInit(event("https://www.dsub.io", {}), parent, [
        "https://www.dsub.io",
      ]),
    ).toBeNull();
    expect(
      readEmbedInit(
        event("https://www.dsub.io", parent, { ...data, type: "resize" }),
        parent,
        ["https://www.dsub.io"],
      ),
    ).toBeNull();
    expect(
      readEmbedInit(
        event("https://www.dsub.io", parent, { ...data, colorScheme: "bad" }),
        parent,
        ["https://www.dsub.io"],
      ),
    ).toBeNull();
  });
  it("sends resize only to the accepted exact origin and rejects invalid heights", () => {
    const postMessage = vi.fn();
    const target = { postMessage } as unknown as Window;
    sendEmbedResize(target, null, 640);
    sendEmbedResize(target, "https://www.dsub.io", Number.NaN);
    expect(postMessage).not.toHaveBeenCalled();
    sendEmbedResize(target, "https://www.dsub.io", 640.2);
    expect(postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: "geul:embed:resize", height: 641 },
      "https://www.dsub.io",
    );
  });
});
