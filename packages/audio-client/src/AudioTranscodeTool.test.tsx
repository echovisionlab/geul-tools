// @vitest-environment jsdom

import { act, StrictMode } from "react";
import { IntlProvider } from "use-intl";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUDIO_TRANSCODER_CODEC_ASSET_MANIFEST,
  AudioTranscoderError,
  type AudioStreamInputSupportResult,
  type AudioStreamOutputSupportResult,
  type AudioStreamTranscodeResult,
  type RuntimeAssetLoadState,
} from "@echovisionlab/audio-transcoder";
import enMessages from "@/messages/en.json";
import koMessages from "@/messages/ko.json";
import type { AudioTranscodeToolViewProps } from "./ui";
import type {
  AudioTranscoderDownloadArtifact,
  AudioTranscoderRuntime,
} from "./audio-transcoder-runtime";
import { AudioTranscodeTool } from "./AudioTranscodeTool";

let capturedProps: AudioTranscodeToolViewProps | null = null;

vi.mock("./ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("./ui")>();
  return {
    ...original,
    AudioTranscodeToolView: (props: AudioTranscodeToolViewProps) => {
      capturedProps = props;
      return <div data-audio-transcode-tool-view />;
    },
  };
});

let container: HTMLDivElement;
let root: Root;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  capturedProps = null;
  consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  consoleErrorSpy.mockRestore();
  vi.unstubAllGlobals();
});

describe("AudioTranscodeTool controller", () => {
  it("reuses the conversion controller for an authenticated HTTP range source without a local picker", async () => {
    const harness = createRuntimeHarness();
    const externalSource = {
      id: "source_12345678",
      downloadUrl:
        "/api/tools/youtube-audio/sources/source_12345678?download=1",
      input: {
        http: {
          credentials: "include" as const,
          size: 123_456,
          url: "https://www.example.invalid/api/tools/youtube-audio/sources/source_12345678",
        },
        name: "Reference.m4a",
      },
      name: "Reference.m4a",
      size: 123_456,
    };
    act(() => {
      root.render(
        <IntlProvider locale="en" messages={enMessages}>
          <AudioTranscodeTool
            runtimeFactory={harness.runtimeFactory}
            externalSource={externalSource}
            initialFormat="mp3"
            title={null}
          />
        </IntlProvider>,
      );
    });

    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));
    expect(harness.probeInput).toHaveBeenCalledWith(
      externalSource,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(viewProps()).toMatchObject({
      format: "mp3",
      showFilePicker: false,
      title: null,
      labels: { description: enMessages.tools.transcode.metadataDescription },
    });
    expect(viewProps().encodingControls[0]).toMatchObject({
      id: "bitrate-bps",
      value: "320000",
    });
    expect(viewProps().files[0]).toMatchObject({
      name: "Reference.m4a",
      sizeLabel: "121 KB",
    });
    expect(viewProps().files[0]?.canDownloadSource).toBe(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 410 })),
    );
    await act(async () => {
      await viewProps().onDownloadSource?.(externalSource.id);
    });
    expect(viewProps().capacityError).toBe(
      enMessages.tools.transcode.sourceDownloadExpired,
    );
    expect(viewProps().files[0]?.status).toBe("ready");
    expect(harness.transcode).not.toHaveBeenCalled();

    act(() => viewProps().onConvertAll());
    await vi.waitFor(() =>
      expect(viewProps().files[0]?.status).toBe("complete"),
    );
    expect(harness.transcode).toHaveBeenCalledWith(
      expect.objectContaining({ source: externalSource }),
    );
  });

  it("stays runtime-lazy and admits only ten files with explicit overflow feedback", async () => {
    const harness = createRuntimeHarness();
    renderController(harness.runtimeFactory);

    expect(harness.runtimeFactory).not.toHaveBeenCalled();
    expect(viewProps().format).toBe("wav");
    expect(
      viewProps().encodingControls.map(({ id, value }) => ({ id, value })),
    ).toEqual([
      { id: "sample-format", value: "integer" },
      { id: "bit-depth", value: "24" },
    ]);
    expect(viewProps().formatOptions.map((option) => option.label)).toEqual([
      "WAV",
      "AIFF",
      "AAC (.aac, ADTS)",
      "Ogg Opus",
      "MP3",
      "FLAC",
    ]);
    expect(viewProps().maxFiles).toBe(10);

    const files = Array.from(
      { length: 11 },
      (_, index) =>
        new File([String(index)], `source-${index}.caf`, {
          type: "audio/x-caf",
        }),
    );
    act(() => viewProps().onFilesSelected(files));

    await vi.waitFor(() => expect(viewProps().files).toHaveLength(10));
    expect(viewProps().capacityError).toContain("1 files were not added");
    expect(viewProps().capacityError).toContain("10");
    expect(harness.probeInput).toHaveBeenCalledTimes(10);
  });

  it("probes one exact selected target before converting and exposes a local download", async () => {
    const harness = createRuntimeHarness();
    renderController(harness.runtimeFactory);

    expect(harness.probeOutput).not.toHaveBeenCalled();
    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1, 2, 3])], "field.caf", {
          type: "audio/x-caf",
        }),
      ]),
    );

    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));
    expect(viewProps().targetMessage).toBeNull();
    expect(harness.probeOutput).toHaveBeenCalledWith(
      { channels: 2, presetId: "wav-pcm24", sampleRate: 48_000 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(viewProps().canConvertAll).toBe(true);

    act(() => viewProps().onConvertAll());
    await vi.waitFor(() =>
      expect(viewProps().files[0]?.status).toBe("complete"),
    );

    expect(harness.transcode).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ name: "field.caf" }),
        target: { presetId: "wav-pcm24" },
      }),
    );
    expect(viewProps().files[0]).toMatchObject({
      downloadHref: "blob:field-output",
      downloadName: "field-converted.wav",
      status: "complete",
    });
  });

  it("preserves the inspected source channel count without exposing a channel selector", async () => {
    const harness = createRuntimeHarness(1);
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "mono.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));

    expect(harness.probeOutput).toHaveBeenCalledWith(
      { channels: 1, presetId: "wav-pcm24", sampleRate: 48_000 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect("channels" in viewProps()).toBe(false);
    expect("channelOptions" in viewProps()).toBe(false);

    act(() => viewProps().onConvertAll());
    await vi.waitFor(() =>
      expect(viewProps().files[0]?.status).toBe("complete"),
    );
    expect(harness.transcode).toHaveBeenCalledWith(
      expect.objectContaining({ target: { presetId: "wav-pcm24" } }),
    );
  });

  it("projects the exact inspected sample rate, channel layout, and bit depth", async () => {
    const harness = createRuntimeHarness(1, 192_000, 32);
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "field.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));

    expect(viewProps().files[0]?.sourceSummary).toBe(
      "CAF · 192 kHz · Mono · 32-bit float",
    );
    expect(harness.probeOutput).toHaveBeenCalledWith(
      { channels: 1, presetId: "wav-pcm24", sampleRate: 192_000 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("distinguishes structured integer PCM metadata from float PCM metadata", async () => {
    const harness = createRuntimeHarness(2, 48_000, 32, "integer");
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "integer.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));

    expect(viewProps().files[0]?.sourceSummary).toBe(
      "CAF · 48 kHz · Stereo · 32-bit signed integer",
    );
  });

  it("projects determinate, indeterminate, and failed codec asset loading states", async () => {
    const harness = createRuntimeHarness();
    renderController(harness.runtimeFactory);
    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "asset.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));

    act(() => harness.emitAssetState("downloading", 512, null));
    expect(viewProps()).toMatchObject({
      engineLoadingProgress: null,
      targetStatus: "checking",
      targetMessage: "Loading the aac audio engine.",
    });

    act(() => harness.emitAssetState("verifying", 512, 1_024));
    expect(viewProps()).toMatchObject({
      engineLoadingProgress: 50,
      targetStatus: "checking",
      targetMessage: "Verifying the aac audio engine.",
    });

    act(() => harness.emitAssetState("error", 512, 1_024));
    expect(viewProps()).toMatchObject({
      targetStatus: "error",
      targetMessage: "The aac audio engine could not be loaded.",
    });
  });

  it("keeps format and encoding options separate and re-probes the selected package preset", async () => {
    const harness = createRuntimeHarness();
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "format.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));

    act(() => viewProps().onFormatChange("mp3"));
    await vi.waitFor(() => {
      expect(viewProps().format).toBe("mp3");
      expect(viewProps().encodingControls).toHaveLength(1);
      expect(viewProps().encodingControls[0]).toMatchObject({
        id: "bitrate-bps",
        value: "320000",
      });
      expect(harness.probeOutput).toHaveBeenLastCalledWith(
        { channels: 2, presetId: "mp3-320kbps", sampleRate: 48_000 },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(
      viewProps().encodingControls[0]?.options.map((option) => option.label),
    ).toEqual([
      "128 kbps · CBR",
      "192 kbps · CBR",
      "256 kbps · CBR",
      "320 kbps · CBR",
    ]);

    act(() => viewProps().onEncodingChange("bitrate-bps", "192000"));
    await vi.waitFor(() =>
      expect(harness.probeOutput).toHaveBeenLastCalledWith(
        { channels: 2, presetId: "mp3-192kbps", sampleRate: 48_000 },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });

  it("keeps a completed download when a newly added file finishes inspection", async () => {
    const harness = createRuntimeHarness();
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "completed.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));
    act(() => viewProps().onConvertAll());
    await vi.waitFor(() =>
      expect(viewProps().files[0]?.status).toBe("complete"),
    );

    act(() =>
      viewProps().onFilesSelected([new File([new Uint8Array([2])], "new.caf")]),
    );
    await vi.waitFor(() => {
      expect(harness.probeOutput).toHaveBeenCalledTimes(2);
      expect(viewProps().files[1]?.status).toBe("ready");
      expect(viewProps().targetStatus).toBe("ready");
    });

    expect(viewProps().files[0]).toMatchObject({
      downloadHref: "blob:field-output",
      status: "complete",
    });
    expect(harness.transcode).toHaveBeenCalledOnce();
    expect(harness.artifact.dispose).not.toHaveBeenCalled();
  });

  it("reports only the current batch and does not inflate successes after a partial failure", async () => {
    const harness = createRuntimeHarness();
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "already-complete.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));
    act(() => viewProps().onConvertAll());
    await vi.waitFor(() =>
      expect(viewProps().files[0]?.status).toBe("complete"),
    );

    const successfulArtifact = harness.createArtifact("blob:second-output");
    harness.transcode
      .mockResolvedValueOnce(successfulArtifact)
      .mockRejectedValueOnce(new Error("encoder failed"));
    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([2])], "succeeds.caf"),
        new File([new Uint8Array([3])], "fails.caf"),
      ]),
    );
    await vi.waitFor(() => {
      expect(
        viewProps()
          .files.slice(1)
          .map((file) => file.status),
      ).toEqual(["ready", "ready"]);
      expect(viewProps().canConvertAll).toBe(true);
    });

    act(() => viewProps().onConvertAll());
    await vi.waitFor(() => expect(viewProps().files[2]?.status).toBe("error"));

    expect(viewProps().files.map((file) => file.status)).toEqual([
      "complete",
      "complete",
      "error",
    ]);
    expect(harness.transcode).toHaveBeenCalledTimes(3);
    expect(viewProps().statusMessage).toBe(
      "Run finished: 2 eligible, 2 attempted, 1 succeeded, 1 failed, 0 unavailable.",
    );
  });

  it("keeps a completed download when another inspected row is removed", async () => {
    const harness = createRuntimeHarness();
    harness.probeOutput.mockResolvedValueOnce({
      code: "SUPPORTED",
      message: "The output runtime probe succeeded.",
      reason: "runtime-verified",
      status: "supported",
    });
    harness.probeOutput.mockResolvedValueOnce({
      code: "UNSUPPORTED_OUTPUT",
      message: "The selected output sample rate is unsupported.",
      reason: "sample-rate",
      status: "unsupported-configuration",
    });
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "completed.caf"),
        new File([new Uint8Array([2])], "remove.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("error"));
    act(() => viewProps().onConvertAll());
    await vi.waitFor(() =>
      expect(viewProps().files[0]?.status).toBe("complete"),
    );

    const removedId = viewProps().files[1]!.id;
    act(() => viewProps().onRemove(removedId));
    await act(async () => undefined);

    expect(viewProps().files).toHaveLength(1);
    expect(viewProps().files[0]).toMatchObject({
      downloadHref: "blob:field-output",
      status: "complete",
    });
    expect(harness.probeOutput).toHaveBeenCalledTimes(2);
    expect(harness.artifact.dispose).not.toHaveBeenCalled();
  });

  it("keeps a conversion error retryable while another file is inspected", async () => {
    const harness = createRuntimeHarness();
    harness.transcode.mockRejectedValueOnce(new Error("encoder failed"));
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "failed.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));
    act(() => viewProps().onConvertAll());
    await vi.waitFor(() => expect(viewProps().files[0]?.status).toBe("error"));
    const conversionMessage = viewProps().files[0]?.message;

    act(() =>
      viewProps().onFilesSelected([new File([new Uint8Array([2])], "new.caf")]),
    );
    await vi.waitFor(() => {
      expect(harness.probeOutput).toHaveBeenCalledTimes(2);
      expect(viewProps().files[1]?.status).toBe("ready");
    });

    expect(viewProps().files[0]).toMatchObject({
      canRetry: true,
      message: conversionMessage,
      status: "error",
    });
  });

  it("converts supported rows without letting one unavailable row block the batch", async () => {
    const harness = createRuntimeHarness();
    harness.probeOutput.mockResolvedValueOnce({
      code: "SUPPORTED",
      message: "The output runtime probe succeeded.",
      reason: "runtime-verified",
      status: "supported",
    });
    harness.probeOutput.mockResolvedValueOnce({
      code: "UNSUPPORTED_OUTPUT",
      message: "The selected output sample rate is unsupported.",
      reason: "sample-rate",
      status: "unsupported-configuration",
    });
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "supported.caf"),
        new File([new Uint8Array([2])], "unavailable.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("error"));

    expect(viewProps().canConvertAll).toBe(true);
    act(() => viewProps().onConvertAll());
    await vi.waitFor(() =>
      expect(viewProps().files[0]?.status).toBe("complete"),
    );
    expect(harness.transcode).toHaveBeenCalledOnce();
    expect(viewProps().files[1]).toMatchObject({
      status: "ready",
      downloadHref: null,
    });
  });

  it("makes a rejected output probe retryable and restores the exact target on retry", async () => {
    const harness = createRuntimeHarness();
    harness.probeOutput.mockRejectedValueOnce(
      new Error("browser codec stalled"),
    );
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "retry-probe.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().files[0]?.status).toBe("error"));
    expect(viewProps().files[0]?.canRetry).toBe(true);
    expect(viewProps().targetStatus).toBe("error");

    act(() => viewProps().onRetry(viewProps().files[0]!.id));
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));

    expect(harness.probeOutput).toHaveBeenCalledTimes(2);
    expect(viewProps().files[0]).toMatchObject({
      status: "ready",
      canRetry: false,
    });
    expect(viewProps().canConvertAll).toBe(true);
  });

  it("reports an exhausted safe input read budget as inconclusive and allows another inspection", async () => {
    const harness = createRuntimeHarness();
    harness.probeInput.mockRejectedValueOnce(
      new AudioTranscoderError(
        "RESOURCE_LIMIT_EXCEEDED",
        "The maximum input read budget was exhausted.",
      ),
    );
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "inconclusive.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().files[0]?.status).toBe("error"));

    expect(viewProps().files[0]?.message).toContain("safe read limit");
    act(() => viewProps().onRetry(viewProps().files[0]!.id));
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));
    expect(harness.probeInput).toHaveBeenCalledTimes(2);
  });

  it("requeues a failed conversion when its row Retry action is used", async () => {
    const harness = createRuntimeHarness();
    const conversionError = new AudioTranscoderError(
      "WORKER_FAILURE",
      "encoder failed",
    );
    harness.transcode.mockRejectedValueOnce(conversionError);
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "retry-conversion.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));
    act(() => viewProps().onConvertAll());
    await vi.waitFor(() => expect(viewProps().files[0]?.status).toBe("error"));
    expect(viewProps().files[0]?.canRetry).toBe(true);
    expect(viewProps().files[0]?.message).toBe(
      "encoder failed [WORKER_FAILURE]",
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Audio transcoder conversion failed.",
      expect.objectContaining({
        code: "WORKER_FAILURE",
        engineVersion: AUDIO_TRANSCODER_CODEC_ASSET_MANIFEST.version,
        error: conversionError,
        input: expect.objectContaining({ bytes: 1, container: "CAF" }),
        message: "encoder failed",
        name: "AudioTranscoderError",
        output: expect.objectContaining({ format: "wav", preset: "wav-pcm24" }),
        reason: null,
      }),
    );
    expect(consoleErrorSpy.mock.calls[0]?.[1]).not.toHaveProperty("input.name");

    act(() => viewProps().onRetry(viewProps().files[0]!.id));
    await vi.waitFor(() =>
      expect(viewProps().files[0]?.status).toBe("complete"),
    );

    expect(harness.transcode).toHaveBeenCalledTimes(2);
    expect(viewProps().files[0]?.downloadHref).toBe("blob:field-output");
  });

  it("explains a browser-local output storage limit", async () => {
    const harness = createRuntimeHarness();
    const storageError = new AudioTranscoderError(
      "RESOURCE_LIMIT_EXCEEDED",
      "Predicted output exceeds the memory fallback.",
      { reason: "output-storage-limit" },
    );
    harness.transcode.mockRejectedValueOnce(storageError);
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "large.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));
    act(() => viewProps().onConvertAll());
    await vi.waitFor(() => expect(viewProps().files[0]?.status).toBe("error"));

    expect(viewProps().files[0]?.message).toBe(
      "This browser cannot hold the expected output in local temporary storage. Choose a smaller or compressed format, or retry in a browser that supports large local outputs. [RESOURCE_LIMIT_EXCEEDED · output-storage-limit]",
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Audio transcoder conversion failed.",
      expect.objectContaining({
        code: "RESOURCE_LIMIT_EXCEEDED",
        error: storageError,
        name: "AudioTranscoderError",
        reason: "output-storage-limit",
      }),
    );
  });

  it("explains when the selected target format cannot represent the output size", async () => {
    const harness = createRuntimeHarness();
    const targetError = new AudioTranscoderError(
      "UNSUPPORTED_OUTPUT",
      "The predicted output exceeds the target container size.",
      { reason: "target-size-limit" },
    );
    harness.transcode.mockRejectedValueOnce(targetError);
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "too-large.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));
    act(() => viewProps().onConvertAll());
    await vi.waitFor(() => expect(viewProps().files[0]?.status).toBe("error"));

    expect(viewProps().files[0]?.message).toBe(
      "The selected output format cannot represent a file this large. Choose another format, or reduce the sample rate, bit depth, or channel count. [UNSUPPORTED_OUTPUT · target-size-limit]",
    );
    expect(viewProps().files[0]?.message).not.toContain(
      "local temporary storage",
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Audio transcoder conversion failed.",
      expect.objectContaining({
        code: "UNSUPPORTED_OUTPUT",
        error: targetError,
        name: "AudioTranscoderError",
        reason: "target-size-limit",
      }),
    );
  });

  it("shows the original message for an unrelated resource limit", async () => {
    const harness = createRuntimeHarness();
    const resourceError = new AudioTranscoderError(
      "RESOURCE_LIMIT_EXCEEDED",
      "The decoder input budget was exhausted.",
    );
    harness.transcode.mockRejectedValueOnce(resourceError);
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "budget.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));
    act(() => viewProps().onConvertAll());
    await vi.waitFor(() => expect(viewProps().files[0]?.status).toBe("error"));

    expect(viewProps().files[0]?.message).toBe(
      "The decoder input budget was exhausted. [RESOURCE_LIMIT_EXCEEDED]",
    );
    expect(viewProps().files[0]?.message).not.toContain(
      "local temporary storage",
    );
  });

  it("shows the original unknown browser error and finishes the failed run when the logger throws", async () => {
    const harness = createRuntimeHarness();
    const browserError = new DOMException(
      "The browser output writer failed.",
      "UnknownError",
    );
    harness.transcode.mockRejectedValueOnce(browserError);
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "unknown.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));
    consoleErrorSpy.mockImplementation((message: unknown) => {
      if (message === "Audio transcoder conversion failed.") {
        throw new Error("Wrapped console failed.");
      }
    });
    act(() => viewProps().onConvertAll());
    await vi.waitFor(() => expect(viewProps().files[0]?.status).toBe("error"));

    expect(viewProps().files[0]?.message).toBe(
      "The browser output writer failed. [UnknownError]",
    );
    expect(viewProps().files[0]?.message).not.toContain("UNKNOWN_ERROR");
    expect(viewProps().statusMessage).toBe(
      "Run finished: 1 eligible, 1 attempted, 0 succeeded, 1 failed, 0 unavailable.",
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Audio transcoder conversion failed.",
      expect.objectContaining({
        code: null,
        error: browserError,
        message: "The browser output writer failed.",
        name: "UnknownError",
        reason: null,
      }),
    );
  });

  it("disposes the previous download before a target-change reconversion", async () => {
    const harness = createRuntimeHarness();
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "replace.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));
    act(() => viewProps().onConvertAll());
    await vi.waitFor(() =>
      expect(viewProps().files[0]?.status).toBe("complete"),
    );

    const replacementArtifact = harness.createArtifact(
      "blob:replacement-output",
    );
    harness.transcode.mockResolvedValueOnce(replacementArtifact);
    const replacementSampleRate = viewProps().sampleRateOptions.find((option) =>
      /^\d+$/.test(option.value),
    )?.value;
    expect(replacementSampleRate).toBeDefined();
    act(() => viewProps().onSampleRateChange(replacementSampleRate!));

    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));
    expect(harness.artifact.dispose).toHaveBeenCalledOnce();
    expect(viewProps().files[0]).toMatchObject({
      downloadHref: null,
      status: "ready",
    });

    act(() => viewProps().onConvertAll());
    await vi.waitFor(() =>
      expect(viewProps().files[0]?.status).toBe("complete"),
    );
    expect(viewProps().files[0]?.downloadHref).toBe("blob:replacement-output");
    expect(harness.artifact.dispose).toHaveBeenCalledOnce();
    expect(replacementArtifact.dispose).not.toHaveBeenCalled();
  });

  it("disposes the browser runtime when the tool unmounts", async () => {
    const harness = createRuntimeHarness();
    renderController(harness.runtimeFactory);
    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "cleanup.caf", { type: "audio/x-caf" }),
      ]),
    );
    await vi.waitFor(() =>
      expect(harness.runtimeFactory).toHaveBeenCalledOnce(),
    );

    act(() => root.unmount());
    await vi.waitFor(() =>
      expect(harness.disposeRuntime).toHaveBeenCalledOnce(),
    );
    root = createRoot(container);
  });

  it("reports a terminal runtime cleanup failure locally without trusting the console wrapper", async () => {
    const cleanupError = new DOMException(
      "The output session could not be removed.",
      "InvalidStateError",
    );
    const harness = createRuntimeHarness();
    harness.disposeRuntime.mockRejectedValueOnce(cleanupError);
    renderController(harness.runtimeFactory);
    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "cleanup.caf"),
      ]),
    );
    await vi.waitFor(() =>
      expect(harness.runtimeFactory).toHaveBeenCalledOnce(),
    );
    consoleErrorSpy.mockClear();
    consoleErrorSpy.mockImplementation(() => {
      throw new Error("Wrapped console failed.");
    });

    expect(() => {
      act(() => root.unmount());
    }).not.toThrow();
    await vi.waitFor(() =>
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Audio transcoder runtime cleanup failed during tool unmount.",
        {
          code: null,
          error: cleanupError,
          message: "The output session could not be removed.",
          name: "InvalidStateError",
          reason: null,
        },
      ),
    );
    expect(consoleErrorSpy.mock.calls[0]?.[1]).not.toHaveProperty("input");
    root = createRoot(container);
  });

  it("remains usable after the React StrictMode effect probe", async () => {
    const harness = createRuntimeHarness();
    renderController(harness.runtimeFactory, true);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "strict-mode.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));

    expect(harness.runtimeFactory).toHaveBeenCalledOnce();
    expect(viewProps().files[0]).toMatchObject({
      name: "strict-mode.caf",
      status: "ready",
    });
  });

  it("defaults to Automatic and lets Ogg choose 48 kHz per source file", async () => {
    const harness = createRuntimeHarness(2, 96_000);
    renderController(harness.runtimeFactory);

    expect(viewProps().sampleRate).toBe("automatic");
    expect(
      viewProps()
        .sampleRateOptions.slice(0, 2)
        .map(({ label, value }) => ({ label, value })),
    ).toEqual([
      { label: "Automatic", value: "automatic" },
      { label: "Preserve source", value: "source" },
    ]);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "high-rate.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));
    act(() => viewProps().onFormatChange("ogg"));

    await vi.waitFor(() =>
      expect(harness.probeOutput).toHaveBeenLastCalledWith(
        { channels: 2, presetId: "ogg-opus-192kbps", sampleRate: 48_000 },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    expect(viewProps().sampleRate).toBe("automatic");
    expect(
      viewProps().sampleRateOptions.find(({ value }) => value === "source"),
    ).toMatchObject({ disabled: true });
  });

  it("visibly resets an invalid Preserve source choice to Automatic after a format change", async () => {
    const harness = createRuntimeHarness(2, 96_000);
    renderController(harness.runtimeFactory);
    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "preserve.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));

    act(() => viewProps().onSampleRateChange("source"));
    await vi.waitFor(() => expect(viewProps().sampleRate).toBe("source"));
    act(() => viewProps().onFormatChange("ogg"));

    await vi.waitFor(() => expect(viewProps().sampleRate).toBe("automatic"));
    expect(viewProps().statusMessage).toContain("changed to Automatic");
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));
  });

  it("does not silently keep a sample rate invalidated by an MP3 bitrate change", async () => {
    const harness = createRuntimeHarness(2, 24_000);
    renderController(harness.runtimeFactory);
    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "mp3-rate.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));

    act(() => viewProps().onFormatChange("mp3"));
    await vi.waitFor(() =>
      expect(viewProps().encodingControls[0]?.value).toBe("320000"),
    );
    act(() => viewProps().onEncodingChange("bitrate-bps", "128000"));
    await vi.waitFor(() =>
      expect(viewProps().encodingControls[0]?.value).toBe("128000"),
    );
    act(() => viewProps().onSampleRateChange("24000"));
    await vi.waitFor(() => expect(viewProps().sampleRate).toBe("24000"));

    act(() => viewProps().onEncodingChange("bitrate-bps", "320000"));
    await vi.waitFor(() => expect(viewProps().sampleRate).toBe("automatic"));
    expect(viewProps().statusMessage).toContain("changed to Automatic");
    expect(
      viewProps().sampleRateOptions.find(({ value }) => value === "24000"),
    ).toMatchObject({ disabled: true });
  });

  it("discloses mixed supported and unavailable rows while converting the supported subset", async () => {
    const harness = createRuntimeHarness();
    harness.probeInput
      .mockResolvedValueOnce(createInputSupport(2, 48_000))
      .mockResolvedValueOnce(createInputSupport(3, 48_000));
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "stereo.caf"),
        new File([new Uint8Array([2])], "three-channel.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().files).toHaveLength(2));
    act(() => viewProps().onFormatChange("mp3"));
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("error"));

    expect(viewProps().targetMessage).toContain(
      "1 files are available for conversion; 1 remain unavailable",
    );
    expect(viewProps().files[1]?.message).toContain("this file has 3");
    expect(viewProps().files[1]?.message).toContain("not downmixed");
    expect(viewProps().canConvertAll).toBe(true);

    act(() => viewProps().onConvertAll());
    await vi.waitFor(() =>
      expect(viewProps().files[0]?.status).toBe("complete"),
    );
    expect(harness.transcode).toHaveBeenCalledOnce();
    expect(viewProps().statusMessage).toBe(
      "Run finished: 1 eligible, 1 attempted, 1 succeeded, 0 failed, 1 unavailable.",
    );
    expect(viewProps().files[1]).toMatchObject({
      downloadHref: null,
      status: "ready",
    });
  });

  it("excludes recognized but undecodable rows from sample-rate availability while counting them as unavailable", async () => {
    const harness = createRuntimeHarness();
    const recognized = createInputSupport(2, 96_000);
    if (recognized.status !== "supported") {
      throw new Error("Expected the test input fixture to be supported.");
    }
    harness.probeInput
      .mockResolvedValueOnce(createInputSupport(2, 48_000))
      .mockResolvedValueOnce({
        inspection: recognized.inspection,
        status: "recognized-unsupported",
      });
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "supported.caf"),
        new File([new Uint8Array([2])], "recognized-but-undecodable.caf"),
      ]),
    );
    await vi.waitFor(() =>
      expect(viewProps().files[1]?.status).toBe("unsupported"),
    );
    act(() => viewProps().onFormatChange("mp3"));
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));

    const preserveSource = viewProps().sampleRateOptions.find(
      (option) => option.value === "source",
    );
    expect(preserveSource).toMatchObject({
      disabled: false,
      label: "Preserve source",
    });

    act(() => viewProps().onConvertAll());
    await vi.waitFor(() =>
      expect(viewProps().files[0]?.status).toBe("complete"),
    );
    expect(viewProps().statusMessage).toBe(
      "Run finished: 1 eligible, 1 attempted, 1 succeeded, 0 failed, 1 unavailable.",
    );
  });

  it("distinguishes a runtime engine outage from a static output constraint", async () => {
    const harness = createRuntimeHarness();
    harness.probeOutput.mockResolvedValueOnce({
      code: "OUTPUT_RUNTIME_UNAVAILABLE",
      message: "The encoder could not start.",
      reason: "encoder-start",
      status: "runtime-unavailable",
    });
    renderController(harness.runtimeFactory);

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "engine.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("error"));

    expect(viewProps().files[0]).toMatchObject({
      canRetry: true,
      status: "error",
    });
    expect(viewProps().files[0]?.message).toContain("runtime engine");
    expect(viewProps().files[0]?.message).toContain("network or asset policy");

    act(() => viewProps().onRetry(viewProps().files[0]!.id));
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));
    expect(harness.probeOutput).toHaveBeenCalledTimes(2);
    expect(viewProps().files[0]).toMatchObject({
      canRetry: false,
      status: "ready",
    });
  });

  it("projects output controls, source channels, and progress phases through the active locale", async () => {
    const harness = createRuntimeHarness();
    act(() => {
      root.render(
        <IntlProvider locale="ko" messages={koMessages}>
          <AudioTranscodeTool runtimeFactory={harness.runtimeFactory} />
        </IntlProvider>,
      );
    });

    act(() =>
      viewProps().onFilesSelected([
        new File([new Uint8Array([1])], "한국어.caf"),
      ]),
    );
    await vi.waitFor(() => expect(viewProps().targetStatus).toBe("ready"));
    expect(viewProps().labels.format).toBe("형식");
    expect(
      viewProps().encodingControls.map((control) => control.label),
    ).toEqual(["샘플 형식", "비트 심도"]);
    expect(
      viewProps()
        .sampleRateOptions.slice(0, 2)
        .map(({ label }) => label),
    ).toEqual(["자동", "원본 유지"]);
    expect(viewProps().files[0]?.sourceSummary).toContain("스테레오");
    expect(viewProps().files[0]?.sourceSummary).toContain("32비트 부동소수점");

    act(() => viewProps().onFormatChange("mp3"));
    await vi.waitFor(() => {
      expect(viewProps().encodingControls[0]?.label).toBe("비트레이트");
      expect(viewProps().targetStatus).toBe("ready");
    });

    act(() => viewProps().onConvertAll());
    await vi.waitFor(() =>
      expect(viewProps().files[0]?.status).toBe("complete"),
    );
    expect(viewProps().files[0]?.progressLabel).toContain("마무리 중");
  });
});

function renderController(
  runtimeFactory: () => AudioTranscoderRuntime,
  strict = false,
) {
  const content = (
    <IntlProvider locale="en" messages={enMessages}>
      <AudioTranscodeTool runtimeFactory={runtimeFactory} />
    </IntlProvider>
  );
  act(() => {
    root.render(strict ? <StrictMode>{content}</StrictMode> : content);
  });
}

function viewProps(): AudioTranscodeToolViewProps {
  expect(capturedProps).not.toBeNull();
  return capturedProps as AudioTranscodeToolViewProps;
}

function createRuntimeHarness(
  inputChannels = 2,
  inputSampleRate = 48_000,
  inputBitDepth = 32,
  inputSampleFormat: "float" | "integer" = "float",
) {
  const inputSupport = createInputSupport(
    inputChannels,
    inputSampleRate,
    inputBitDepth,
    inputSampleFormat,
  );
  const outputSupport = {
    code: "SUPPORTED",
    message: "The output runtime probe succeeded.",
    reason: "runtime-verified",
    status: "supported",
  } satisfies AudioStreamOutputSupportResult;
  const result = {
    bytesWritten: 3,
    channels: inputChannels,
    details: { format: "wav", rf64: false },
    durationSeconds: 1,
    format: "wav",
    preset: {
      bitDepth: 24,
      container: "wav",
      extension: "wav",
      id: "wav-pcm24",
      mimeType: "audio/wav",
      sampleFormat: "integer",
    },
    rf64: false,
    sampleRate: inputSampleRate,
  } satisfies AudioStreamTranscodeResult;
  const createArtifact = (url: string): AudioTranscoderDownloadArtifact => ({
    dispose: vi.fn(async () => undefined),
    mimeType: "audio/wav",
    name: "field-converted.wav",
    result,
    size: 3,
    storage: "opfs",
    url,
  });
  const artifact = createArtifact("blob:field-output");
  const probeInput = vi.fn<AudioTranscoderRuntime["probeInput"]>(
    async () => inputSupport,
  );
  const probeOutput = vi.fn<AudioTranscoderRuntime["probeOutput"]>(
    async () => outputSupport,
  );
  const transcode = vi.fn(
    async (request: Parameters<AudioTranscoderRuntime["transcode"]>[0]) => {
      request.onProgress?.({
        durationSeconds: 1,
        phase: "encode",
        processedSeconds: 1,
        progress: 1,
      });
      return artifact;
    },
  );
  const disposeRuntime = vi.fn(async () => undefined);
  const runtime = {
    dispose: disposeRuntime,
    getCapabilities: () => {
      throw new Error("Controller uses the static manifest.");
    },
    getQueueSnapshot: () => ({
      active: 0,
      concurrency: 1,
      maxQueued: 9,
      queued: 0,
      terminated: false,
      workers: 0,
    }),
    getStorageMode: async () => "opfs" as const,
    probeInput,
    probeOutput,
    transcode,
  } satisfies AudioTranscoderRuntime;
  let onAssetStateChange: ((state: RuntimeAssetLoadState) => void) | undefined;
  const runtimeFactory = vi.fn(
    (options?: {
      readonly onAssetStateChange?: (state: RuntimeAssetLoadState) => void;
    }) => {
      onAssetStateChange = options?.onAssetStateChange;
      return runtime;
    },
  );

  return {
    artifact,
    createArtifact,
    disposeRuntime,
    emitAssetState(
      phase: RuntimeAssetLoadState["phase"],
      loadedBytes: number,
      totalBytes: number | null,
    ) {
      onAssetStateChange?.({
        assetName: "aac",
        error: phase === "error" ? new Error("asset failed") : null,
        loadedBytes,
        phase,
        totalBytes,
      } as RuntimeAssetLoadState);
    },
    probeInput,
    probeOutput,
    runtimeFactory,
    transcode,
  };
}

function createInputSupport(
  channels: number,
  sampleRate: number,
  bitDepth = 32,
  sampleFormat: "float" | "integer" = "float",
): AudioStreamInputSupportResult {
  return {
    status: "supported",
    inspection: {
      bitDepth,
      channels,
      codec: "lpcm",
      container: "CAF",
      decodeSupport: "built-in",
      durationSeconds: 1,
      notes: [],
      sampleRate,
      size: 3,
      sourceEncoding: {
        bitDepth,
        endianness: "big",
        kind: "pcm",
        sampleFormat,
        signedness: sampleFormat === "float" ? "not-applicable" : "signed",
      },
    },
  };
}
