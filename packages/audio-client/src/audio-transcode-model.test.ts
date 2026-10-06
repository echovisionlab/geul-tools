import { describe, expect, it } from "vitest";
import type {
  AudioStreamInspection,
  AudioTranscoderStreamCapabilities,
} from "@echovisionlab/audio-transcoder";
import {
  AUDIO_TRANSCODE_AUTOMATIC_VALUE,
  AUDIO_TRANSCODE_SOURCE_VALUE,
  DEFAULT_AUDIO_TRANSCODE_FORMAT,
  DEFAULT_AUDIO_TRANSCODE_PRESET,
  buildAudioTranscodeAccept,
  buildAudioTranscodeEncodingControls,
  buildAudioTranscodeFormatOptions,
  buildAudioTranscodeSampleRateOptions,
  findAudioTranscodeFormat,
  findAudioTranscodePreset,
  formatAudioBytes,
  formatAudioTranscodePreset,
  getAudioTranscodeCapabilities,
  getDefaultAudioTranscodePreset,
  resolveAudioTranscodeTarget,
  selectAudioTranscodeEncodingPreset,
} from "./audio-transcode-model";

const inspection = {
  bitDepth: 32,
  channels: 2,
  codec: "lpcm",
  container: "CAF",
  decodeSupport: "built-in",
  durationSeconds: 1,
  notes: [],
  sampleRate: 48_000,
  size: 1_024,
  sourceEncoding: {
    bitDepth: 32,
    endianness: "big",
    kind: "pcm",
    sampleFormat: "float",
    signedness: "not-applicable",
  },
} satisfies AudioStreamInspection;

const encodingLabels = {
  bitDepth: "Bit depth",
  bitDepthContainerEffective: (containerBits: number, effectiveBits: number) =>
    `${containerBits}-bit container / ${effectiveBits}-bit effective`,
  bitrate: "Bitrate",
  codec: "Codec",
  constantBitrate: "CBR",
  float: "Float",
  integer: "Integer PCM",
  sampleFormat: "Sample format",
  variableBitrate: "VBR",
};

const sampleRateLabels = {
  automatic: "Automatic",
  availableFor: (supported: number, total: number) =>
    `${supported} of ${total} files`,
  preserveSource: "Preserve source",
  unavailable: "Unavailable",
};

describe("audio transcode model", () => {
  it("builds input hints and all six installed output formats from package capabilities", () => {
    const accept = buildAudioTranscodeAccept();
    const formats = buildAudioTranscodeFormatOptions();

    expect(accept).toContain(".caf");
    expect(accept).toContain(".wav");
    expect(accept).toContain(".m4a");
    expect(accept).toContain(".ogg");
    expect(formats).toEqual([
      { value: "wav", label: "WAV" },
      { value: "aiff", label: "AIFF" },
      { value: "aac", label: "AAC (.aac, ADTS)" },
      { value: "ogg", label: "Ogg Opus" },
      { value: "mp3", label: "MP3" },
      { value: "flac", label: "FLAC" },
    ]);
    expect(findAudioTranscodeFormat(DEFAULT_AUDIO_TRANSCODE_FORMAT)?.id).toBe(
      "wav",
    );
  });

  it("uses format-specific semantic controls instead of a duplicated preset list", () => {
    expect(
      buildAudioTranscodeEncodingControls("wav", "wav-pcm24", encodingLabels),
    ).toEqual([
      {
        id: "sample-format",
        label: "Sample format",
        options: [
          { value: "integer", label: "Integer PCM" },
          { value: "float", label: "Float" },
        ],
        value: "integer",
      },
      {
        id: "bit-depth",
        label: "Bit depth",
        options: [
          { value: "16", label: "16-bit" },
          { value: "24", label: "24-bit" },
          { value: "32", label: "32-bit container / 24-bit effective" },
        ],
        value: "24",
      },
    ]);
    expect(
      buildAudioTranscodeEncodingControls(
        "aiff",
        "aiff-pcm24",
        encodingLabels,
      )[0],
    ).toMatchObject({
      id: "bit-depth",
      value: "24",
    });
    for (const [format, preset] of [
      ["aac", "aac-256kbps"],
      ["ogg", "ogg-opus-192kbps"],
      ["mp3", "mp3-320kbps"],
    ] as const) {
      expect(
        buildAudioTranscodeEncodingControls(format, preset, encodingLabels)[0],
      ).toMatchObject({
        id: "bitrate-bps",
      });
    }
    expect(
      buildAudioTranscodeEncodingControls(
        "flac",
        "flac-24bit",
        encodingLabels,
      )[0],
    ).toMatchObject({
      id: "bit-depth",
    });
    expect(
      buildAudioTranscodeEncodingControls(
        "wav",
        "wav-float32",
        encodingLabels,
      )[1]?.options,
    ).toEqual([{ value: "32", label: "32-bit" }]);
    expect(
      buildAudioTranscodeEncodingControls(
        "mp3",
        "mp3-320kbps",
        encodingLabels,
      )[0]?.options.at(-1),
    ).toEqual({
      value: "320000",
      label: "320 kbps · CBR",
    });
  });

  it("moves between WAV integer and float presets without exposing an invalid combination", () => {
    expect(
      selectAudioTranscodeEncodingPreset(
        "wav",
        "wav-pcm24",
        "sample-format",
        "float",
      )?.preset.id,
    ).toBe("wav-float32");
    expect(
      selectAudioTranscodeEncodingPreset(
        "wav",
        "wav-float32",
        "sample-format",
        "integer",
      )?.preset.id,
    ).toBe("wav-pcm24");
    expect(
      selectAudioTranscodeEncodingPreset("wav", "wav-pcm24", "bit-depth", "16")
        ?.preset.id,
    ).toBe("wav-pcm16");
  });

  it("selects deterministic defaults for every installed format", () => {
    expect(getDefaultAudioTranscodePreset("wav")?.preset.id).toBe(
      DEFAULT_AUDIO_TRANSCODE_PRESET,
    );
    expect(getDefaultAudioTranscodePreset("aiff")?.preset.id).toBe(
      "aiff-pcm24",
    );
    expect(getDefaultAudioTranscodePreset("aac")?.preset.id).toBe(
      "aac-256kbps",
    );
    expect(getDefaultAudioTranscodePreset("ogg")?.preset.id).toBe(
      "ogg-opus-192kbps",
    );
    expect(getDefaultAudioTranscodePreset("mp3")?.preset.id).toBe(
      "mp3-320kbps",
    );
    expect(getDefaultAudioTranscodePreset("flac")?.preset.id).toBe(
      "flac-24bit",
    );
  });

  it("uses user-facing AAC and Ogg Opus labels for completed output", () => {
    expect(
      formatAudioTranscodePreset(findAudioTranscodePreset("aac-256kbps")!),
    ).toBe("AAC (.aac, ADTS) · 256 kbps VBR");
    expect(
      formatAudioTranscodePreset(findAudioTranscodePreset("ogg-opus-192kbps")!),
    ).toBe("Ogg Opus · 192 kbps VBR");
    expect(
      formatAudioTranscodePreset(findAudioTranscodePreset("mp3-320kbps")!),
    ).toBe("MP3 · 320 kbps CBR");
  });

  it.each([1, 2, 6])(
    "preserves a %i-channel source and source rate in the conversion target",
    (channels) => {
      const resolved = resolveAudioTranscodeTarget(
        "wav",
        "wav-pcm24",
        { ...inspection, channels },
        AUDIO_TRANSCODE_AUTOMATIC_VALUE,
      );

      expect(resolved).toEqual({
        probeTarget: { presetId: "wav-pcm24", sampleRate: 48_000, channels },
        target: { presetId: "wav-pcm24" },
      });
    },
  );

  it("derives source-aware sample-rate controls from package contracts", () => {
    const descriptor = findAudioTranscodePreset("ogg-opus-192kbps");
    expect(descriptor).not.toBeNull();
    if (!descriptor) {
      return;
    }

    const options = buildAudioTranscodeSampleRateOptions(
      "ogg",
      descriptor,
      [
        {
          id: "field",
          inspection: { ...inspection, sampleRate: 96_000 },
          name: "field.caf",
        },
      ],
      sampleRateLabels,
    );
    expect(
      options.map(({ disabled, label, value }) => ({ disabled, label, value })),
    ).toEqual([
      { disabled: false, value: "automatic", label: "Automatic" },
      {
        disabled: true,
        value: "source",
        label: "Preserve source · Unavailable",
      },
      { disabled: false, value: "48000", label: "48 kHz" },
      { disabled: true, value: "96000", label: "96 kHz · Unavailable" },
    ]);
    expect(
      resolveAudioTranscodeTarget(
        "ogg",
        descriptor.preset.id,
        { ...inspection, sampleRate: 96_000 },
        AUDIO_TRANSCODE_SOURCE_VALUE,
      ),
    ).toMatchObject({ reason: "sample-rate" });
    expect(
      resolveAudioTranscodeTarget(
        "ogg",
        descriptor.preset.id,
        { ...inspection, channels: 6 },
        "48000",
      ),
    ).toMatchObject({ reason: "channels" });
    expect(
      resolveAudioTranscodeTarget(
        "ogg",
        descriptor.preset.id,
        { ...inspection, channels: null },
        "48000",
      ),
    ).toMatchObject({ reason: "source-inspection" });
  });

  it("uses bitrate-dependent MP3 rates without hardcoded codec arrays", () => {
    const row = [
      {
        id: "field",
        inspection: { ...inspection, sampleRate: 24_000 },
        name: "field.caf",
      },
    ];
    const lowBitrate = buildAudioTranscodeSampleRateOptions(
      "mp3",
      findAudioTranscodePreset("mp3-128kbps")!,
      row,
      sampleRateLabels,
    );
    const highBitrate = buildAudioTranscodeSampleRateOptions(
      "mp3",
      findAudioTranscodePreset("mp3-320kbps")!,
      row,
      sampleRateLabels,
    );

    expect(lowBitrate.find(({ value }) => value === "24000")?.disabled).toBe(
      false,
    );
    expect(highBitrate.find(({ value }) => value === "24000")?.disabled).toBe(
      true,
    );
    expect(highBitrate.find(({ value }) => value === "32000")?.disabled).toBe(
      false,
    );
  });

  it("keeps mixed-row choices and identifies exactly which file cannot use one", () => {
    const options = buildAudioTranscodeSampleRateOptions(
      "wav",
      findAudioTranscodePreset("wav-pcm24")!,
      [
        { id: "standard", inspection, name: "standard.caf" },
        {
          id: "high",
          inspection: { ...inspection, sampleRate: 384_000 },
          name: "high.caf",
        },
      ],
      sampleRateLabels,
    );
    const rate192 = options.find(({ value }) => value === "192000");

    expect(rate192).toMatchObject({
      disabled: false,
      label: "192 kHz · 1 of 2 files",
      supportedRowCount: 1,
    });
    expect(
      rate192?.unavailableRows.map(({ name, reason }) => ({ name, reason })),
    ).toEqual([{ name: "high.caf", reason: "resampling-source-sample-rate" }]);
  });

  it("passes 384 kHz through but rejects attempts to resample to or from it", () => {
    const highRate = { ...inspection, sampleRate: 384_000 };
    expect(
      resolveAudioTranscodeTarget(
        "wav",
        "wav-pcm24",
        highRate,
        AUDIO_TRANSCODE_AUTOMATIC_VALUE,
      ),
    ).toEqual({
      probeTarget: { channels: 2, presetId: "wav-pcm24", sampleRate: 384_000 },
      target: { presetId: "wav-pcm24" },
    });
    expect(
      resolveAudioTranscodeTarget("wav", "wav-pcm24", highRate, "192000"),
    ).toMatchObject({
      reason: "sample-rate",
    });
    expect(
      resolveAudioTranscodeTarget("wav", "wav-pcm24", inspection, "384000"),
    ).toMatchObject({
      reason: "sample-rate",
    });
  });

  it("includes an explicit sample rate only for resampling", () => {
    expect(
      resolveAudioTranscodeTarget("wav", "wav-pcm24", inspection, "44100"),
    ).toEqual({
      probeTarget: { presetId: "wav-pcm24", sampleRate: 44_100, channels: 2 },
      target: { presetId: "wav-pcm24", sampleRate: 44_100 },
    });
  });

  it("validates format and preserved channels against a supplied capability manifest", () => {
    const capabilities = getAudioTranscodeCapabilities();
    const capabilitiesWithoutMp3 = {
      ...capabilities,
      outputFormats: capabilities.outputFormats.filter(
        (format) => format.id !== "mp3",
      ),
      outputPresets: capabilities.outputPresets.filter(
        (preset) => preset.container !== "mp3",
      ),
    } satisfies AudioTranscoderStreamCapabilities;
    const monoOnlyCapabilities = {
      ...capabilities,
      limits: {
        ...capabilities.limits,
        channels: { minimum: 1, maximum: 1 },
      },
    } satisfies AudioTranscoderStreamCapabilities;

    expect(
      resolveAudioTranscodeTarget(
        "mp3",
        "mp3-320kbps",
        inspection,
        AUDIO_TRANSCODE_SOURCE_VALUE,
        capabilitiesWithoutMp3,
      ),
    ).toMatchObject({ reason: "format" });
    expect(
      resolveAudioTranscodeTarget(
        "wav",
        "wav-pcm24",
        inspection,
        AUDIO_TRANSCODE_SOURCE_VALUE,
        monoOnlyCapabilities,
      ),
    ).toMatchObject({ reason: "channels" });
  });

  it("formats file sizes without presenting binary values as decimal megabytes", () => {
    expect(formatAudioBytes(0)).toBe("0 B");
    expect(formatAudioBytes(1_024)).toBe("1 KB");
    expect(formatAudioBytes(2.5 * 1_024 * 1_024)).toBe("2.5 MB");
  });
});
