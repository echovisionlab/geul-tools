// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { useMantineColorScheme } from "@mantine/core";
import { useLocale } from "use-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountTool } from "./index";

const mounted = vi.hoisted(() => ({ roots: [] as Root[] }));
vi.mock("react-dom/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom/client")>();
  return {
    ...actual,
    createRoot: (...args: Parameters<typeof actual.createRoot>) => {
      const root = actual.createRoot(...args);
      mounted.roots.push(root);
      return root;
    },
  };
});

const parentOrigin = "https://www.dsub.io";
const originalParent = Object.getOwnPropertyDescriptor(window, "parent")!;
let container: HTMLDivElement;
let parent: Window;
let postMessage: ReturnType<typeof vi.fn>;
let notifyResize: ResizeObserverCallback;
const disconnect = vi.fn();

function Content() {
  const locale = useLocale();
  const { colorScheme } = useMantineColorScheme();
  return (
    <div data-locale={locale} data-theme={colorScheme}>
      Content
    </div>
  );
}

function initialize(origin = parentOrigin, source: Window = parent) {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin,
      source,
      data: { type: "geul:embed:init", locale: "ko", colorScheme: "dark" },
    }),
  );
}

beforeEach(() => {
  container = document.createElement("div");
  container.id = "root";
  document.body.append(container);
  vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
    height: 332,
  } as DOMRect);
  postMessage = vi.fn();
  parent = { postMessage } as unknown as Window;
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: parent,
  });
  window.__GEUL_TOOL_CONFIG__ = { tool: "hwp", parentOrigins: [parentOrigin] };
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = callback;
      }
      observe() {
        notifyResize([], this as unknown as ResizeObserver);
      }
      disconnect = disconnect;
    },
  );
});

afterEach(() => {
  act(() => {
    for (const root of mounted.roots) root.unmount();
  });
  mounted.roots.length = 0;
  container.remove();
  Object.defineProperty(window, "parent", originalParent);
  delete (window as Partial<Window>).__GEUL_TOOL_CONFIG__;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function mount() {
  act(() => mountTool({ tool: "hwp", render: () => <Content /> }));
}

function resizeMessages() {
  return postMessage.mock.calls.filter(
    ([message]) => message.type === "geul:embed:resize",
  );
}

describe("mini app Embed bootstrap", () => {
  it("recovers an initialization sent before mount by accepting the parent's immediate ready response", () => {
    // The parent's first initialization is lost before React installs its listener.
    initialize();
    postMessage.mockImplementation((message, targetOrigin) => {
      if (message.type === "geul:embed:ready" && targetOrigin === parentOrigin)
        initialize();
    });
    mount();
    expect(
      container.querySelector("[data-locale]")?.getAttribute("data-locale"),
    ).toBe("ko");
    expect(
      container.querySelector("[data-theme]")?.getAttribute("data-theme"),
    ).toBe("dark");
    expect(document.documentElement.lang).toBe("ko");
    expect(resizeMessages()).toEqual([
      [{ type: "geul:embed:resize", height: 332 }, parentOrigin],
    ]);
    expect(
      postMessage.mock.calls.filter(
        ([message]) => message.type === "geul:embed:ready",
      ),
    ).toHaveLength(1);
  });

  it("waits for trusted delayed initialization and then reports subsequent content growth", () => {
    window.__GEUL_TOOL_CONFIG__.parentOrigins.push("https://dsub.io");
    mount();
    expect(postMessage.mock.calls).toEqual([
      [{ type: "geul:embed:ready" }, parentOrigin],
      [{ type: "geul:embed:ready" }, "https://dsub.io"],
    ]);
    expect(resizeMessages()).toHaveLength(0);
    act(() => {
      initialize("https://www.dsub.io.attacker.example");
      initialize(parentOrigin, window);
    });
    expect(
      container.querySelector("[data-locale]")?.getAttribute("data-locale"),
    ).toBe("en");
    expect(resizeMessages()).toHaveLength(0);
    act(() => initialize());
    expect(
      container.querySelector("[data-locale]")?.getAttribute("data-locale"),
    ).toBe("ko");
    expect(resizeMessages()).toEqual([
      [{ type: "geul:embed:resize", height: 332 }, parentOrigin],
    ]);
    vi.mocked(container.getBoundingClientRect).mockReturnValue({
      height: 1024.2,
    } as DOMRect);
    act(() => notifyResize([], {} as ResizeObserver));
    expect(resizeMessages().at(-1)).toEqual([
      { type: "geul:embed:resize", height: 1025 },
      parentOrigin,
    ]);
    expect(
      postMessage.mock.calls.filter(
        ([message]) => message.type === "geul:embed:ready",
      ),
    ).toHaveLength(2);
  });

  it("removes its initialization listener and disconnects resize observation on unmount", () => {
    mount();
    const root = mounted.roots.pop()!;
    act(() => root.unmount());
    expect(disconnect).toHaveBeenCalledOnce();
    const messageCount = postMessage.mock.calls.length;
    act(() => initialize());
    expect(postMessage).toHaveBeenCalledTimes(messageCount);
  });

  it("does not bootstrap an Embed bridge in a standalone tab", () => {
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: window,
    });
    const selfPostMessage = vi.spyOn(window, "postMessage");
    mount();
    expect(selfPostMessage).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
  });
});
