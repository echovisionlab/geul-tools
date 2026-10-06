// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { IntlProvider } from "use-intl";
import { createStudioComponent } from "rust-hwp-intl/editor";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HwpEditor } from "./HwpEditor";

vi.mock("rust-hwp-intl/editor", () => ({ createStudioComponent: vi.fn() }));
type Studio = Awaited<ReturnType<typeof createStudioComponent>>;
function deferredStudio() {
  let resolve!: (studio: Studio) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Studio>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(createStudioComponent).mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function render({
  strict = false,
  label = "HWP / HWPX editor",
  locale = "en",
  theme = "light",
}: {
  strict?: boolean;
  label?: string;
  locale?: string;
  theme?: "light" | "dark";
} = {}) {
  const tool = (
    <IntlProvider locale={locale} messages={{}}>
      <MantineProvider forceColorScheme={theme}>
        <HwpEditor
          labels={{
            label,
            loading: "Loading editor…",
            error: "The editor could not be loaded. Try again.",
            retry: "Try again",
          }}
        />
      </MantineProvider>
    </IntlProvider>
  );
  act(() => root.render(strict ? <StrictMode>{tool}</StrictMode> : tool));
}
function installStartup(pending: ReturnType<typeof deferredStudio>) {
  const documentView = document.createElement("section");
  documentView.dataset.studioDocument = "unsaved-work";
  const destroy = vi.fn(() => documentView.remove());
  const setAppearance = vi.fn();
  const studio = { destroy, setAppearance } as unknown as Studio;
  vi.mocked(createStudioComponent).mockImplementationOnce(
    (mount: HTMLElement) => {
      mount.append(documentView);
      return pending.promise;
    },
  );
  return { documentView, destroy, setAppearance, studio };
}

describe("HwpEditor DOM lifecycle", () => {
  it("starts the DOM studio in document scroll mode using tool-owned assets, without an iframe or height bridge", async () => {
    const added = vi.spyOn(window, "addEventListener");
    const pending = deferredStudio();
    const startup = installStartup(pending);
    render({ locale: "ko", theme: "dark" });
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Loading editor…",
    );
    expect(createStudioComponent).toHaveBeenCalledExactlyOnceWith(
      expect.any(HTMLElement),
      {
        studioUrl: expect.stringMatching(
          /\/vendors\/rust-hwp-intl\/0\.2\.1\/index\.html$/,
        ),
        locale: "ko",
        theme: "dark",
        scrollMode: "document",
      },
    );
    expect(container.querySelector("iframe")).toBeNull();
    expect(
      added.mock.calls.filter(([type]) => type === "message"),
    ).toHaveLength(0);
    expect(
      container.querySelector<HTMLElement>("[data-hwp-editor-mount]")!.style
        .height,
    ).toBe("");
    await act(async () => pending.resolve(startup.studio));
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[data-status="ready"]')).not.toBeNull();
    expect(startup.setAppearance).toHaveBeenLastCalledWith({
      locale: "ko",
      theme: "dark",
    });
    act(() => root.render(null));
    expect(startup.destroy).toHaveBeenCalledOnce();
    expect(startup.documentView.isConnected).toBe(false);
  });

  it("updates locale, theme and accessible label without recreating the studio or losing unsaved work", async () => {
    const pending = deferredStudio();
    const startup = installStartup(pending);
    render();
    await act(async () => pending.resolve(startup.studio));
    render({ locale: "ja", theme: "dark", label: "Updated editor label" });
    expect(startup.setAppearance).toHaveBeenLastCalledWith({
      locale: "ja",
      theme: "dark",
    });
    expect(createStudioComponent).toHaveBeenCalledOnce();
    expect(
      container.querySelector('[aria-label="Updated editor label"]'),
    ).not.toBeNull();
    expect(container.querySelector("[data-studio-document]")).toBe(
      startup.documentView,
    );
    expect(startup.documentView.dataset.studioDocument).toBe("unsaved-work");
    expect(startup.destroy).not.toHaveBeenCalled();
  });

  it("applies the latest appearance when startup resolves after an update", async () => {
    const pending = deferredStudio();
    const startup = installStartup(pending);
    render({ locale: "en" });
    render({ locale: "ko", theme: "dark" });
    await act(async () => pending.resolve(startup.studio));
    expect(startup.setAppearance).toHaveBeenLastCalledWith({
      locale: "ko",
      theme: "dark",
    });
    expect(createStudioComponent).toHaveBeenCalledOnce();
  });

  it("shows localized startup failure and retries in a fresh owned mount", async () => {
    const failed = deferredStudio();
    installStartup(failed);
    render();
    const failedMount = vi.mocked(createStudioComponent).mock.calls[0]![0];
    await act(async () =>
      failed.reject(new Error("internal transport failure")),
    );
    expect(container.textContent).toContain(
      "The editor could not be loaded. Try again.",
    );
    expect(container.textContent).not.toContain("internal transport failure");
    expect(container.querySelector("[data-studio-document]")).toBeNull();
    const pending = deferredStudio();
    const startup = installStartup(pending);
    act(() => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(createStudioComponent).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createStudioComponent).mock.calls[1]![0]).not.toBe(
      failedMount,
    );
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => pending.resolve(startup.studio));
    expect(container.querySelector("[data-studio-document]")).toBe(
      startup.documentView,
    );
    expect(container.querySelector("button")).toBeNull();
  });

  it("destroys a late-ready studio after navigation without reattaching its owned mount", async () => {
    const pending = deferredStudio();
    const startup = installStartup(pending);
    render();
    act(() => root.render(null));
    expect(startup.documentView.isConnected).toBe(false);
    await act(async () => pending.resolve(startup.studio));
    expect(startup.destroy).toHaveBeenCalledOnce();
    expect(startup.setAppearance).not.toHaveBeenCalled();
    expect(container.childElementCount).toBe(0);
  });

  it("isolates StrictMode startup cleanup so an old studio cannot remove the active document", async () => {
    const old = deferredStudio();
    const current = deferredStudio();
    const oldStartup = installStartup(old);
    const currentStartup = installStartup(current);
    render({ strict: true });
    expect(createStudioComponent).toHaveBeenCalledTimes(2);
    expect(oldStartup.documentView.isConnected).toBe(false);
    expect(currentStartup.documentView.isConnected).toBe(true);
    await act(async () => old.resolve(oldStartup.studio));
    expect(oldStartup.destroy).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => current.resolve(currentStartup.studio));
    expect(currentStartup.destroy).not.toHaveBeenCalled();
    expect(container.querySelector("[data-studio-document]")).toBe(
      currentStartup.documentView,
    );
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("keeps ready documents in natural DOM flow and limits placeholder minimum height to pending/error content", () => {
    const css = readFileSync(
      "apps/hwp/src/ui/HwpEditorView.module.css",
      "utf8",
    );
    expect(css).not.toMatch(/(?:^|[;{])\s*height\s*:/);
    expect(css).not.toMatch(/overflow\s*:\s*hidden|iframe|--hwp-editor-height/);
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)];
    const minimumHeightRules = rules.filter((rule) =>
      /min-height\s*:/.test(rule[2]!),
    );
    expect(minimumHeightRules).toHaveLength(1);
    expect(minimumHeightRules[0]![1]!.trim()).toBe(".status");
  });
});
