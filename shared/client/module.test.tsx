// @vitest-environment jsdom
import { act, useEffect, useState } from "react";
import { Portal, useMantineColorScheme } from "@mantine/core";
import { useLocale } from "use-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createToolMount,
  type ToolMountHandle,
  type ToolMountOptions,
} from "./module";
import {
  useToolRuntimeConfig,
  type ToolRuntimeConfig,
} from "./runtime-context";

import { readFileSync } from "node:fs";
const fontAssignmentCss = readFileSync(
  "shared/styles/font-assignment.css",
  "utf8",
);

let host: HTMLDivElement;
let handles: ToolMountHandle[];
let engineStarts: number;
let engineDisposals: number;
const cssUrl = new URL("https://tools-transcode.dsub.io/embed/style.css");
const configUrl = new URL(
  "https://tools-transcode.dsub.io/runtime-config.json",
);
const config: ToolRuntimeConfig = {
  tool: "transcode",
  parentOrigins: [window.location.origin],
  apiOrigin: "https://www.dsub.io",
};
function Content() {
  const locale = useLocale();
  const { colorScheme } = useMantineColorScheme();
  const runtime = useToolRuntimeConfig();
  const [count, setCount] = useState(0);
  useEffect(() => {
    engineStarts++;
    return () => {
      engineDisposals++;
    };
  }, []);
  return (
    <>
      <button
        data-locale={locale}
        data-theme={colorScheme}
        data-api={runtime?.apiOrigin}
        onClick={() => setCount(count + 1)}
      >
        {count}
      </button>
      <Portal>
        <span data-portal-content>Inside shadow</span>
      </Portal>
    </>
  );
}
const mount = createToolMount({
  tool: "transcode",
  render: () => <Content />,
  cssUrl,
  configUrl,
});

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  handles = [];
  engineStarts = 0;
  engineDisposals = 0;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(config)));
});
afterEach(() => {
  act(() => handles.forEach((handle) => handle.destroy()));
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function stylesheet(): HTMLLinkElement {
  return host.shadowRoot!.querySelector("link")!;
}
async function ready(
  options: ToolMountOptions = { locale: "en", colorScheme: "light" },
): Promise<ToolMountHandle> {
  let handle: ToolMountHandle;
  await act(async () => {
    const pending = mount(host, options);
    stylesheet().dispatchEvent(new Event("load"));
    handle = await pending;
    handles.push(handle);
  });
  return handle!;
}

describe("direct tool module", () => {
  it("owns a ShadowRoot, styles and portals without modifying the parent document or runtime global", async () => {
    const html = document.documentElement.outerHTML.split("<body")[0];
    const globalConfig = window.__GEUL_TOOL_CONFIG__;
    await ready({ locale: "ko", colorScheme: "dark" });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(configUrl, {
      signal: expect.any(AbortSignal),
      credentials: "omit",
    });
    expect(stylesheet().href).toBe(cssUrl.href);
    expect(host.lang).toBe("ko");
    expect(host.dir).toBe("ltr");
    expect(host.dataset.fontProfile).toBe("korean");
    expect(host.dataset.mantineColorScheme).toBe("dark");
    expect(host.shadowRoot!.querySelector("button")?.dataset).toMatchObject({
      locale: "ko",
      theme: "dark",
      api: "https://www.dsub.io",
    });
    expect(
      host.shadowRoot!.querySelector(
        "[data-tool-portals] [data-portal-content]",
      ),
    ).not.toBeNull();
    expect(document.querySelector("[data-portal-content]")).toBeNull();
    expect(
      host.shadowRoot!.querySelector("style[data-mantine-styles]")?.textContent,
    ).toContain(":host");
    expect(document.documentElement.outerHTML.split("<body")[0]).toBe(html);
    expect(window.__GEUL_TOOL_CONFIG__).toBe(globalConfig);
    expect(host.style.height).toBe("");
  });

  it("inherits parent site font tokens without loading or registering module fonts", async () => {
    const fontFace = vi.fn();
    vi.stubGlobal("FontFace", fontFace);
    const head = document.head.innerHTML;
    const parent = document.createElement("div");
    parent.style.setProperty("--font-family-sans", '"DSUB site sans"');
    parent.style.setProperty("--font-mono", '"DSUB site mono"');
    document.body.append(parent);
    parent.append(host);
    try {
      const handle = await ready({ locale: "ko", colorScheme: "light" });
      act(() => handle.update({ locale: "ja", colorScheme: "dark" }));
      const themeCss = host.shadowRoot!.querySelector(
        "style[data-mantine-styles]",
      )!.textContent!;
      expect(themeCss).toMatch(
        /--mantine-font-family:\s*var\(--font-family-sans\), sans-serif/,
      );
      expect(themeCss).toMatch(
        /--mantine-font-family-monospace:\s*var\(--font-mono\), monospace/,
      );
      expect(host.style.getPropertyValue("--font-family-sans")).toBe("");
      expect(host.style.getPropertyValue("--font-mono")).toBe("");
      const rules = [...fontAssignmentCss.matchAll(/([^{}]+)\{([^{}]+)\}/g)];
      const fontTokenRules = rules.filter((rule) =>
        /--font-family-sans:|--font-mono:/.test(rule[2]!),
      );
      expect(fontTokenRules.length).toBeGreaterThan(0);
      for (const rule of fontTokenRules) expect(rule[1]).not.toContain(":host");
      expect(fontAssignmentCss).toContain('html[data-font-profile="korean"]');
      expect(fontAssignmentCss).toContain(":root {");
      expect(document.head.innerHTML).toBe(head);
      expect(fontFace).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      parent.remove();
    }
  });

  it("updates locale and theme without remounting the engine or losing state, then cleans up owned nodes and attributes", async () => {
    host.lang = "fr";
    host.dataset.fontProfile = "parent";
    const handle = await ready();
    act(() => host.shadowRoot!.querySelector("button")!.click());
    act(() => handle.update({ locale: "ar", colorScheme: "dark" }));
    expect(engineStarts).toBe(1);
    expect(engineDisposals).toBe(0);
    expect(host.shadowRoot!.querySelector("button")?.textContent).toBe("1");
    expect(host.dir).toBe("rtl");
    expect(host.dataset.fontProfile).toBe("arabic");
    expect(host.shadowRoot!.querySelector("button")?.dataset).toMatchObject({
      locale: "ar",
      theme: "dark",
    });
    act(() => {
      handle.destroy();
      handle.destroy();
      handle.update({ locale: "ko", colorScheme: "light" });
    });
    expect(engineDisposals).toBe(1);
    expect(host.shadowRoot!.childNodes).toHaveLength(0);
    expect(host.lang).toBe("fr");
    expect(host.dataset.fontProfile).toBe("parent");
    expect(host.hasAttribute("dir")).toBe(false);
    expect(host.hasAttribute("data-mantine-color-scheme")).toBe(false);
  });

  it("waits for stylesheet load and rejects failures with no mounted engine", async () => {
    const pending = mount(host, { locale: "en", colorScheme: "light" });
    await Promise.resolve();
    expect(engineStarts).toBe(0);
    const rejected = expect(pending).rejects.toThrow("stylesheet");
    stylesheet().dispatchEvent(new Event("error"));
    await rejected;
    expect(host.shadowRoot!.childNodes).toHaveLength(0);
  });

  it("rejects configuration failures without waiting for stylesheet load", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    await expect(
      mount(host, { locale: "en", colorScheme: "light" }),
    ).rejects.toThrow("configuration failed");
    expect(host.shadowRoot!.childNodes).toHaveLength(0);
    expect(engineStarts).toBe(0);
  });

  it("aborts pending configuration/style loading and rejects a late response without rendering", async () => {
    let resolveResponse!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveResponse = resolve;
        }),
    );
    const controller = new AbortController();
    const pending = mount(host, {
      locale: "en",
      colorScheme: "light",
      signal: controller.signal,
    });
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    resolveResponse(Response.json(config));
    await rejected;
    expect(vi.mocked(fetch).mock.calls[0]![1]?.signal?.aborted).toBe(true);
    expect(host.shadowRoot!.childNodes).toHaveLength(0);
    expect(engineStarts).toBe(0);
  });

  it("does not mount after its configuration body resolves late following cancellation", async () => {
    let resolveConfig!: (config: ToolRuntimeConfig) => void;
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        new Promise((resolve) => {
          resolveConfig = resolve;
        }),
    } as Response);
    const controller = new AbortController();
    const pending = mount(host, {
      locale: "en",
      colorScheme: "light",
      signal: controller.signal,
    });
    stylesheet().dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(resolveConfig).toBeDefined());
    controller.abort();
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    resolveConfig(config);
    await rejected;
    expect(engineStarts).toBe(0);
    expect(host.shadowRoot!.childNodes).toHaveLength(0);
  });

  it("rejects already aborted owners without touching their host", async () => {
    await expect(
      mount(host, {
        locale: "en",
        colorScheme: "light",
        signal: AbortSignal.abort(),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(host.shadowRoot).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("destroys a mounted instance when its owner aborts", async () => {
    const controller = new AbortController();
    await ready({
      locale: "en",
      colorScheme: "light",
      signal: controller.signal,
    });
    act(() => controller.abort());
    expect(engineDisposals).toBe(1);
    expect(host.shadowRoot!.childNodes).toHaveLength(0);
  });

  it.each([
    { ...config, parentOrigins: ["https://foreign.invalid"] },
    { ...config, parentOrigins: [`${window.location.origin}.foreign.invalid`] },
    { ...config, tool: "youtube-audio" },
  ])(
    "rejects unauthorized parent origins and mismatched tool configuration",
    async (responseConfig) => {
      vi.mocked(fetch).mockResolvedValue(Response.json(responseConfig));
      const pending = mount(host, { locale: "en", colorScheme: "light" });
      stylesheet().dispatchEvent(new Event("load"));
      await expect(pending).rejects.toThrow();
      expect(engineStarts).toBe(0);
      expect(host.shadowRoot!.childNodes).toHaveLength(0);
    },
  );

  it("rejects a second mount without destroying the existing instance", async () => {
    await ready();
    await expect(
      mount(host, { locale: "en", colorScheme: "light" }),
    ).rejects.toThrow("already contains");
    expect(engineStarts).toBe(1);
    expect(engineDisposals).toBe(0);
  });
});
