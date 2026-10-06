// @vitest-environment jsdom

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { createEditor } from "rust-hwp-intl/editor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HwpEditor } from "./HwpEditor";

vi.mock("rust-hwp-intl/editor", () => ({ createEditor: vi.fn() }));

type Editor = Awaited<ReturnType<typeof createEditor>>;

function deferredEditor() {
  let resolve!: (editor: Editor) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Editor>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: false,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.mocked(createEditor).mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function render(strict = false, label = "HWP / HWPX editor") {
  const tool = (
    <MantineProvider>
      <HwpEditor
        labels={{
          label,
          loading: "Loading editor…",
          error: "The editor could not be loaded. Try again.",
          retry: "Try again",
        }}
      />
    </MantineProvider>
  );
  act(() => root.render(strict ? <StrictMode>{tool}</StrictMode> : tool));
}

function installStartup(pending: ReturnType<typeof deferredEditor>) {
  const iframe = document.createElement("iframe");
  const destroy = vi.fn(() => iframe.remove());
  const editor = { destroy } as unknown as Editor;
  vi.mocked(createEditor).mockImplementationOnce((mount, options) => {
    iframe.src = options!.studioUrl!;
    (mount as HTMLElement).appendChild(iframe);
    return pending.promise;
  });
  return { iframe, destroy, editor };
}

describe("HwpEditor lifecycle", () => {
  it("mounts the same-origin editor once, reports readiness, and destroys it on navigation", async () => {
    const pending = deferredEditor();
    const { iframe, editor, destroy } = installStartup(pending);
    render();
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Loading editor…",
    );
    expect(iframe.src).toBe(
      new URL(
        "/vendors/rust-hwp-intl/0.1.0/index.html?scroll=page",
        window.location.origin,
      ).href,
    );
    expect(iframe.title).toBe("HWP / HWPX editor");

    await act(async () => pending.resolve(editor));
    expect(container.querySelector('[role="status"]')).toBeNull();
    render();
    expect(createEditor).toHaveBeenCalledOnce();
    expect(iframe.isConnected).toBe(true);

    act(() => root.render(null));
    expect(destroy).toHaveBeenCalledOnce();
    expect(iframe.isConnected).toBe(false);
  });

  it("updates the accessible title without recreating an active editor", async () => {
    const pending = deferredEditor();
    const { iframe, editor, destroy } = installStartup(pending);
    render();
    await act(async () => pending.resolve(editor));
    iframe.dataset.document = "unsaved-work";
    render(false, "Updated editor label");
    expect(iframe.title).toBe("Updated editor label");
    expect(container.querySelector("iframe")).toBe(iframe);
    expect(iframe.dataset.document).toBe("unsaved-work");
    expect(createEditor).toHaveBeenCalledOnce();
    expect(destroy).not.toHaveBeenCalled();
  });

  it("shows a localized startup error and retries in a fresh mount without exposing internal errors", async () => {
    const failed = deferredEditor();
    installStartup(failed);
    render();
    await act(async () =>
      failed.reject(new Error("internal transport failure")),
    );
    expect(container.textContent).toContain(
      "The editor could not be loaded. Try again.",
    );
    expect(container.textContent).not.toContain("internal transport failure");
    expect(container.querySelector("iframe")).toBeNull();

    const pending = deferredEditor();
    const { editor, iframe } = installStartup(pending);
    act(() => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(createEditor).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => pending.resolve(editor));
    expect(container.querySelector("iframe")).toBe(iframe);
    expect(container.querySelector("button")).toBeNull();
  });

  it("accepts document height only from its same-origin frame and supports document shrink", async () => {
    const pending = deferredEditor();
    const { iframe, editor } = installStartup(pending);
    render();
    await act(async () => pending.resolve(editor));
    const host = container.querySelector<HTMLElement>(
      "[aria-label][aria-busy]",
    )!;
    const send = (
      height: unknown,
      origin = window.location.origin,
      source = iframe.contentWindow,
    ) => {
      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            origin,
            source,
            data: { type: "rhwp:content-height", height },
          }),
        );
      });
    };
    send(4800);
    expect(host.style.getPropertyValue("--hwp-editor-height")).toBe("4800px");
    send(9000, "https://other.example");
    send(9000, window.location.origin, window);
    for (const invalid of [0, -1, Infinity, NaN, "9000"]) {
      send(invalid);
    }
    expect(host.style.getPropertyValue("--hwp-editor-height")).toBe("4800px");
    send(800);
    expect(host.style.getPropertyValue("--hwp-editor-height")).toBe("800px");
  });

  it("removes height listeners on failure, retry, and unmount and ignores disposed callbacks", async () => {
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const first = deferredEditor();
    const firstStartup = installStartup(first);
    render();
    const firstListener = added.mock.calls.find(
      ([type]) => type === "message",
    )![1] as EventListener;
    const firstMessage = new MessageEvent("message", {
      origin: window.location.origin,
      source: firstStartup.iframe.contentWindow,
      data: { type: "rhwp:content-height", height: 4200 },
    });
    act(() => window.dispatchEvent(firstMessage));
    expect(
      container
        .querySelector<HTMLElement>("[aria-busy]")!
        .style.getPropertyValue("--hwp-editor-height"),
    ).toBe("4200px");
    await act(async () => first.reject(new Error("failed")));
    expect(removed).toHaveBeenCalledWith("message", firstListener);
    expect(
      container
        .querySelector<HTMLElement>("[aria-busy]")!
        .style.getPropertyValue("--hwp-editor-height"),
    ).toBe("0px");

    const second = deferredEditor();
    const secondStartup = installStartup(second);
    act(() => container.querySelector<HTMLButtonElement>("button")!.click());
    act(() => firstListener(firstMessage));
    expect(
      container
        .querySelector<HTMLElement>("[aria-busy]")!
        .style.getPropertyValue("--hwp-editor-height"),
    ).toBe("0px");
    const listeners = added.mock.calls.filter(([type]) => type === "message");
    const secondListener = listeners[listeners.length - 1][1] as EventListener;
    const secondMessage = new MessageEvent("message", {
      origin: window.location.origin,
      source: secondStartup.iframe.contentWindow,
      data: { type: "rhwp:content-height", height: 1700 },
    });
    act(() => window.dispatchEvent(secondMessage));
    expect(
      container
        .querySelector<HTMLElement>("[aria-busy]")!
        .style.getPropertyValue("--hwp-editor-height"),
    ).toBe("1700px");
    act(() => root.render(null));
    expect(removed).toHaveBeenCalledWith("message", secondListener);
    act(() => secondListener(secondMessage));
    expect(container.childElementCount).toBe(0);
  });

  it("destroys a late-ready editor after unmount", async () => {
    const pending = deferredEditor();
    const { editor, iframe, destroy } = installStartup(pending);
    render();
    act(() => root.render(null));
    expect(iframe.isConnected).toBe(false);
    await act(async () => pending.resolve(editor));
    expect(destroy).toHaveBeenCalledOnce();
    expect(container.childElementCount).toBe(0);
  });

  it("isolates StrictMode startup cleanup so the old editor cannot remove the active editor", async () => {
    const old = deferredEditor();
    const current = deferredEditor();
    const oldStartup = installStartup(old);
    const currentStartup = installStartup(current);
    render(true);
    expect(createEditor).toHaveBeenCalledTimes(2);
    expect(oldStartup.iframe.isConnected).toBe(false);
    expect(currentStartup.iframe.isConnected).toBe(true);

    await act(async () => old.resolve(oldStartup.editor));
    expect(oldStartup.destroy).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => current.resolve(currentStartup.editor));
    expect(currentStartup.destroy).not.toHaveBeenCalled();
    expect(container.querySelector("iframe")).toBe(currentStartup.iframe);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
