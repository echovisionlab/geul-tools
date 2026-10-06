// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AudioTranscodeToolView,
  type AudioTranscodeFileViewModel,
  type AudioTranscodeToolLabels,
  type AudioTranscodeToolViewProps,
} from "./AudioTranscodeToolView";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  }),
});

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

const labels: AudioTranscodeToolLabels = {
  title: "Audio transcoder",
  description: "Convert audio files in your browser without uploading them.",
  notices: "Open-source licenses",
  targetIdle: "Waiting",
  targetChecking: "Checking support",
  targetReady: "Ready",
  targetError: "Unavailable",
  dropTitle: "Drop or choose audio files",
  dropDescription: "Up to 10 files · No folders · Processed on this device",
  chooseFiles: "Choose audio files",
  supportedFormatsLabel: "Supported formats",
  supportedFormats:
    "Supported: CAF, AIFF/AIFC, WAV, FLAC, MP3, AAC/M4A, Ogg/Opus, and audio in MP4, MOV, MKV/WebM, or TS. Checked per file.",
  filesSelected: "Files",
  outputSettings: "Output settings",
  outputSettingsHelper:
    "Channels stay unchanged. Automatic selects a compatible rate per file.",
  processingDetails: "Processing details",
  processingDetailsDescription:
    "Balanced resampling. Integer output is dithered. Large WAV files use RF64.",
  format: "Format",
  sampleRate: "Sample rate",
  queue: "Conversion queue",
  convert: "Convert",
  cancelAll: "Cancel all",
  clear: "Clear",
  download: "Download",
  downloadSource: "Download original",
  retry: "Retry",
  cancel: "Cancel",
  remove: "Remove",
};

function fileModel(
  id: string,
  status: AudioTranscodeFileViewModel["status"] = "ready",
  overrides: Partial<AudioTranscodeFileViewModel> = {},
): AudioTranscodeFileViewModel {
  return {
    id,
    name: `${id}.wav`,
    sizeLabel: "24 MB",
    sourceSummary: "48 kHz · Stereo · 24-bit",
    outputSummary: "WAV · PCM 24-bit · 48 kHz · Stereo",
    status,
    statusLabel: status,
    message: null,
    progress: null,
    progressLabel: null,
    downloadHref: null,
    downloadName: null,
    canRetry: status === "error",
    canCancel: status === "converting" || status === "queued",
    canRemove: status !== "converting" && status !== "queued",
    ...overrides,
  };
}

const handlers = {
  onFilesSelected: vi.fn(),
  onFormatChange: vi.fn(),
  onSampleRateChange: vi.fn(),
  onEncodingChange: vi.fn(),
  onConvertAll: vi.fn(),
  onCancelAll: vi.fn(),
  onClear: vi.fn(),
  onRetry: vi.fn(),
  onCancel: vi.fn(),
  onRemove: vi.fn(),
};

const baseProps: AudioTranscodeToolViewProps = {
  labels,
  files: [],
  accept: "audio/*,.wav,.flac",
  maxFiles: 10,
  noticesHref:
    "https://github.com/echovisionlab/audio-transcoder/blob/v0.1.0/THIRD_PARTY_NOTICES.md",
  format: "wav",
  formatOptions: [{ value: "wav", label: "WAV" }],
  sampleRate: "source",
  sampleRateOptions: [{ value: "source", label: "Preserve source" }],
  encodingControls: [
    {
      id: "sample-format",
      label: "Sample format",
      value: "integer",
      options: [
        { value: "integer", label: "Integer PCM" },
        { value: "float", label: "Float" },
      ],
    },
    {
      id: "bit-depth",
      label: "Bit depth",
      value: "24",
      options: [
        { value: "16", label: "16-bit" },
        { value: "24", label: "24-bit" },
        { value: "32", label: "32-bit" },
      ],
    },
  ],
  targetStatus: "ready",
  targetMessage: "Worker ready",
  capacityError: null,
  statusMessage: null,
  settingsNotice: null,
  canAddFiles: true,
  canConvertAll: false,
  canCancelAll: false,
  canClear: false,
  isConverting: false,
  ...handlers,
};

let container: HTMLDivElement;
let root: Root;

function renderView(props: Partial<AudioTranscodeToolViewProps> = {}) {
  act(() => {
    root.render(
      <MantineProvider>
        <AudioTranscodeToolView {...baseProps} {...props} />
      </MantineProvider>,
    );
  });
}

function getButton(text: string) {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find((candidate) => candidate.textContent?.trim() === text);
  if (!button) {
    throw new Error(`Expected button ${text}`);
  }
  return button;
}

function dispatchDrop(target: Element, files: readonly File[]) {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    configurable: true,
    value: {
      files,
      items: files.map((file) => ({
        kind: "file",
        type: file.type,
        getAsFile: () => file,
      })),
      types: ["Files"],
      dropEffect: "none",
    },
  });
  target.dispatchEvent(event);
  return event;
}

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

describe("AudioTranscodeToolView", () => {
  it("uses accessible indeterminate Core progress while inspecting a file without a percentage", () => {
    renderView({
      files: [
        fileModel("inspect", "inspecting", { statusLabel: "Inspecting audio" }),
      ],
    });
    const row = container.querySelector('[data-file-status="inspecting"]');
    const progress = row?.querySelector('[role="progressbar"]');
    expect(row?.getAttribute("aria-busy")).toBe("true");
    expect(progress?.getAttribute("aria-label")).toBe("Inspecting audio");
    expect(progress?.hasAttribute("aria-valuenow")).toBe(false);
    expect(progress?.hasAttribute("aria-valuetext")).toBe(false);
    expect(row?.textContent).not.toContain("%");
  });

  it("shows the shared page title and description and hides both when embedded", () => {
    renderView();
    expect(container.querySelector("h1")?.textContent).toBe(labels.title);
    expect(container.textContent).toContain(labels.description);

    renderView({ title: null });
    expect(container.querySelector("h1")).toBeNull();
    expect(container.textContent).not.toContain(labels.description);
    expect(container.textContent).toContain(labels.outputSettings);
  });

  it("forwards picker and drag/drop file intent without accepting folders", async () => {
    renderView();

    const input = container.querySelector<HTMLInputElement>(
      "[data-file-dropzone-picker]",
    );
    const dropzone = container.querySelector<HTMLElement>(
      "[data-file-dropzone]",
    );
    expect(input).not.toBeNull();
    expect(dropzone).not.toBeNull();
    expect(input?.multiple).toBe(true);
    expect(input?.hasAttribute("webkitdirectory")).toBe(false);
    expect(input?.getAttribute("accept")).toBe("audio/*,.wav,.flac");
    expect(dropzone?.textContent).toContain("Drop or choose audio files");
    expect(dropzone?.textContent).toContain("Processed on this device");
    expect(dropzone?.textContent).not.toContain("Supported: CAF");
    expect(container.textContent).not.toContain("No audio selected");
    const notices = container.querySelector<HTMLAnchorElement>(
      'a[href="https://github.com/echovisionlab/audio-transcoder/blob/v0.1.0/THIRD_PARTY_NOTICES.md"]',
    );
    expect(notices?.textContent).toBe("Open-source licenses");
    expect(notices?.rel).toContain("noopener");

    const formatsDisclosure = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-disclosure] button"),
    ).find((button) => button.textContent?.trim() === "Supported formats");
    const processingDisclosure = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-disclosure] button"),
    ).find((button) => button.textContent?.trim() === "Processing details");
    expect(formatsDisclosure?.getAttribute("aria-expanded")).toBe("false");
    expect(processingDisclosure?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("Processing details");
    expect(container.textContent).toContain("Large WAV files use RF64.");

    act(() => {
      formatsDisclosure?.click();
      processingDisclosure?.click();
    });

    expect(formatsDisclosure?.getAttribute("aria-expanded")).toBe("true");
    expect(processingDisclosure?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Supported: CAF");

    const picked = new File(["picked"], "picked.wav", { type: "audio/wav" });
    if (!input || !dropzone) {
      throw new Error("Expected file input and drop target");
    }
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [picked],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    expect(handlers.onFilesSelected).toHaveBeenNthCalledWith(1, [picked]);

    const dropped = new File(["dropped"], "dropped.flac", {
      type: "audio/flac",
    });
    let dropEvent: Event | undefined;
    await act(async () => {
      dropEvent = dispatchDrop(dropzone, [dropped]);
      await Promise.resolve();
    });
    expect(dropEvent?.defaultPrevented).toBe(true);
    expect(handlers.onFilesSelected).toHaveBeenNthCalledWith(2, [dropped]);
  });

  it("forwards queue and row actions and renders completed downloads as download links", () => {
    const onDownloadSource = vi.fn();
    renderView({
      onDownloadSource,
      files: [
        fileModel("ready", "ready", { canDownloadSource: true }),
        fileModel("active", "converting", {
          progress: 38,
          progressLabel: "Converting active.wav: 38%",
        }),
        fileModel("failed", "error"),
        fileModel("done", "complete", {
          downloadHref: "blob:https://example.test/output",
          downloadName: "done-pcm24.wav",
        }),
      ],
      canConvertAll: true,
      canCancelAll: false,
      canClear: true,
    });

    const queueActions = container.querySelector(
      "[data-audio-transcode-queue-actions]",
    );
    expect(queueActions?.textContent).toBe("ClearConvert");
    const queueList = container.querySelector("ul");
    expect(queueList).not.toBeNull();
    expect(
      Array.from(queueList?.children ?? []).every(
        (child) => child.tagName === "LI",
      ),
    ).toBe(true);

    act(() => getButton("Convert").click());
    act(() => getButton("Clear").click());
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Retry: failed.wav"]')
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Cancel: active.wav"]')
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Remove: ready.wav"]')
        ?.click(),
    );

    expect(handlers.onConvertAll).toHaveBeenCalledOnce();
    expect(handlers.onClear).toHaveBeenCalledOnce();
    expect(handlers.onRetry).toHaveBeenCalledWith("failed");
    expect(handlers.onCancel).toHaveBeenCalledWith("active");
    expect(handlers.onRemove).toHaveBeenCalledWith("ready");
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Download original: ready.wav"]',
        )
        ?.click(),
    );
    expect(onDownloadSource).toHaveBeenCalledWith("ready");
    expect(
      container.querySelector('[aria-label="Download original: active.wav"]'),
    ).toBeNull();

    const download = container.querySelector<HTMLAnchorElement>(
      '[aria-label="Download: done.wav"]',
    );
    expect(download?.getAttribute("href")).toBe(
      "blob:https://example.test/output",
    );
    expect(download?.getAttribute("download")).toBe("done-pcm24.wav");

    renderView({
      files: [fileModel("active", "converting")],
      canCancelAll: true,
      isConverting: true,
    });
    act(() => getButton("Cancel all").click());
    expect(handlers.onCancelAll).toHaveBeenCalledOnce();
  });

  it("shows explicit capacity feedback and blocks additional picker and drop actions", () => {
    renderView({
      files: Array.from({ length: 10 }, (_, index) =>
        fileModel(`file-${index}`),
      ),
      capacityError: "Only 10 files can be added at once.",
      canAddFiles: false,
    });

    const alert = container.querySelector(
      "[data-audio-transcode-capacity-error]",
    );
    const input = container.querySelector<HTMLInputElement>(
      "[data-file-dropzone-picker]",
    );
    const dropzone = container.querySelector<HTMLElement>(
      "[data-file-dropzone]",
    );
    expect(alert?.textContent).toContain("Only 10 files can be added at once.");
    expect(container.textContent).toContain("10 / 10");
    expect(input?.disabled).toBe(true);
    expect(dropzone?.getAttribute("aria-disabled")).toBe("true");

    const extra = new File(["extra"], "extra.wav", { type: "audio/wav" });
    if (!dropzone) {
      throw new Error("Expected drop target");
    }
    act(() => {
      dispatchDrop(dropzone, [extra]);
    });
    expect(handlers.onFilesSelected).not.toHaveBeenCalled();
  });

  it("uses format-specific encoding controls while preserving channels outside the UI", () => {
    renderView();

    const selects = Array.from(
      container.querySelectorAll<HTMLSelectElement>("select"),
    );
    expect(selects).toHaveLength(4);
    expect(selects.map((select) => select.labels?.[0]?.textContent)).toEqual([
      "Format",
      "Sample rate",
      "Sample format",
      "Bit depth",
    ]);
    expect(container.textContent).not.toContain("Add test tone");
  });

  it("renders an automatic settings reset as a visible notice", () => {
    renderView({
      settingsNotice:
        "The sample rate changed to Automatic because the selected output cannot use it.",
    });

    const notice = container.querySelector<HTMLElement>(
      "[data-audio-transcode-settings-notice]",
    );
    expect(notice).not.toBeNull();
    expect(notice?.closest("[aria-live]")).toBeNull();
    expect(notice ? window.getComputedStyle(notice).display : "none").not.toBe(
      "none",
    );
    expect(notice?.textContent).toContain("changed to Automatic");
  });

  it("keeps useful ready details passed by the controller alongside the ready badge", () => {
    renderView({
      targetStatus: "ready",
      targetMessage:
        "Worker ready · temporary output uses local browser storage",
    });

    expect(
      container.querySelector("[data-audio-transcode-target-status]")
        ?.textContent,
    ).toBe("Ready");
    expect(container.textContent).toContain(
      "Worker ready · temporary output uses local browser storage",
    );
  });

  it("exposes target, progress, and live queue status to assistive technology", () => {
    renderView({
      files: [
        fileModel("active", "converting", {
          progress: 61,
          progressLabel: "Converting active.wav: 61%",
        }),
      ],
      targetStatus: "checking",
      targetMessage: "Loading local worker",
      engineLoadingProgress: null,
      statusMessage: "Converting file 1 of 1: 61%.",
      canCancelAll: true,
      isConverting: true,
    });

    const outputSettings = container.querySelector(
      '[aria-labelledby$="-settings-title"]',
    );
    const queue = container.querySelector('[aria-labelledby$="-queue-title"]');
    const engineProgressRoot = container.querySelector<HTMLElement>(
      "[data-audio-transcode-engine-progress]",
    );
    const engineProgress = outputSettings?.querySelector<HTMLElement>(
      '[role="progressbar"][aria-label="Loading local worker"]',
    );
    const progress = queue?.querySelector<HTMLElement>(
      '[role="progressbar"][aria-label="Converting active.wav: 61%"]',
    );
    const dropzone = container.querySelector<HTMLElement>(
      "[data-file-dropzone]",
    );
    const liveStatus = container.querySelector('[aria-live="polite"]');
    expect(outputSettings?.textContent).toContain("Checking support");
    expect(outputSettings?.textContent).toContain("Loading local worker");
    expect(engineProgressRoot?.contains(engineProgress ?? null)).toBe(true);
    expect(engineProgress?.getAttribute("aria-label")).toBe(
      "Loading local worker",
    );
    expect(engineProgress?.hasAttribute("aria-valuenow")).toBe(false);
    expect(progress?.getAttribute("aria-valuenow")).toBe("61");
    expect(progress?.getAttribute("aria-label")).toBe(
      "Converting active.wav: 61%",
    );
    expect(progress?.getAttribute("aria-valuetext")).toBe(
      "Converting active.wav: 61%",
    );
    expect(queue?.contains(dropzone)).toBe(true);
    expect(queue?.contains(progress ?? null)).toBe(true);
    expect(liveStatus?.textContent).toBe("Converting file 1 of 1: 61%.");

    expect(dropzone?.getAttribute("role")).toBe("button");
    expect(dropzone?.getAttribute("aria-disabled")).toBe("true");
    expect(
      container.querySelector<HTMLInputElement>("[data-file-dropzone-picker]")
        ?.disabled,
    ).toBe(true);
  });
});
