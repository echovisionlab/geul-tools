// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  YoutubeAudioToolView,
  type YoutubeAudioToolViewProps,
} from "./YoutubeAudioToolView";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const handlers = { onClear: vi.fn(), onResolve: vi.fn(), onUrlChange: vi.fn() };
const baseProps: YoutubeAudioToolViewProps = {
  labels: {
    title: "YouTube Audio",
    description:
      "Convert audio from an authenticated YouTube source in your browser.",
    urlLabel: "Video link",
    urlPlaceholder: "https://…",
    resolve: "Load audio",
    resolving: "Loading audio",
    clear: "Clear source",
  },
  url: "",
  resolving: false,
  error: null,
  resolvedTitle: null,
  converter: null,
  ...handlers,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function render(props: Partial<YoutubeAudioToolViewProps> = {}) {
  act(() => {
    root.render(
      <MantineProvider>
        <YoutubeAudioToolView {...baseProps} {...props} />
      </MantineProvider>,
    );
  });
}

describe("YoutubeAudioToolView", () => {
  it("loads a non-empty source by clicking an ordinary button without a form", () => {
    render({ url: "https://youtu.be/abcdefghijk" });
    expect(container.querySelector("h1")?.textContent).toBe(
      baseProps.labels.title,
    );
    expect(container.textContent).toContain(baseProps.labels.description);
    expect(
      container.querySelector<HTMLInputElement>('input[type="url"]')
        ?.placeholder,
    ).toBe("https://…");
    expect(container.querySelector("form")).toBeNull();
    const load = container.querySelector<HTMLButtonElement>("button")!;
    expect(load.type).toBe("button");
    expect(load.disabled).toBe(false);
    act(() => load.click());
    expect(handlers.onResolve).toHaveBeenCalledOnce();
  });

  it("loads once on Enter in the URL input without native form submission", () => {
    render({ url: "https://youtu.be/abcdefghijk" });
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    act(() => container.querySelector("input")!.dispatchEvent(enter));
    expect(enter.defaultPrevented).toBe(true);
    expect(handlers.onResolve).toHaveBeenCalledOnce();
  });

  it.each(["", "   "])(
    "does not load an empty URL %j by click or Enter",
    (url) => {
      render({ url });
      const load = container.querySelector<HTMLButtonElement>("button")!;
      expect(load.disabled).toBe(true);
      act(() => {
        load.click();
        container.querySelector("input")!.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      expect(handlers.onResolve).not.toHaveBeenCalled();
    },
  );

  it("blocks another click or Enter while a source is loading", () => {
    render({ url: "https://youtu.be/abcdefghijk", resolving: true });
    const input = container.querySelector<HTMLInputElement>("input")!;
    const load = container.querySelector<HTMLButtonElement>("button")!;
    expect(input.disabled).toBe(true);
    expect(load.disabled).toBe(true);
    expect(load.textContent).toContain(baseProps.labels.resolving);
    act(() => {
      load.click();
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(handlers.onResolve).not.toHaveBeenCalled();
  });

  it.each([
    { key: "Enter", isComposing: true },
    { key: "Enter", repeat: true },
    { key: "Escape" },
  ])(
    "ignores IME confirmation, repeated Enter and other keys: %j",
    (options) => {
      render({ url: "https://youtu.be/abcdefghijk" });
      act(() =>
        container.querySelector("input")!.dispatchEvent(
          new KeyboardEvent("keydown", {
            ...options,
            bubbles: true,
            cancelable: true,
          }),
        ),
      );
      expect(handlers.onResolve).not.toHaveBeenCalled();
    },
  );

  it("renders source status, converter content, clear action, and a field error", () => {
    render({
      error: "Enter a valid YouTube URL.",
      resolvedTitle: "Reference audio",
      converter: <div data-converter>Converter</div>,
      url: "invalid",
    });
    expect(container.textContent).toContain("Reference audio");
    expect(container.textContent).toContain("Enter a valid YouTube URL.");
    expect(container.querySelector("[data-converter]")).not.toBeNull();
    const clear = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Clear source",
    );
    act(() => clear?.click());
    expect(handlers.onClear).toHaveBeenCalledOnce();
  });
});
