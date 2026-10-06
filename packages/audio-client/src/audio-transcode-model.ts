import {
  AUDIO_STREAM_AUTOMATIC_SAMPLE_RATE,
  AUDIO_STREAM_SOURCE_SAMPLE_RATE,
  AUDIO_TRANSCODER_STREAM_CAPABILITIES,
  getAudioStreamOutputEncodingOptions,
  getAudioStreamOutputParameters,
  getAudioStreamOutputSampleRateOptions,
  resolveAudioStreamSourceAwareFormatTarget,
  type AudioStreamInspection,
  type AudioStreamOutputParameterId,
  type AudioStreamOutputParameterValue,
  type AudioStreamOutputFormatDescriptor,
  type AudioStreamOutputPresetDescriptor,
  type AudioStreamOutputSampleRateOptionsErrorReason,
  type AudioStreamOutputSampleRateUnsupportedReason,
  type AudioStreamSourceAwareSampleRateSelection,
  type AudioTranscoderStreamCapabilities,
} from "@echovisionlab/audio-transcoder";
import type { AudioTranscodeOption } from "./ui";

export const AUDIO_TRANSCODE_AUTOMATIC_VALUE =
  AUDIO_STREAM_AUTOMATIC_SAMPLE_RATE;
export const AUDIO_TRANSCODE_SOURCE_VALUE = AUDIO_STREAM_SOURCE_SAMPLE_RATE;
export const DEFAULT_AUDIO_TRANSCODE_FORMAT = "wav";
export const DEFAULT_AUDIO_TRANSCODE_PRESET = "wav-pcm24";

const DEFAULT_AUDIO_TRANSCODE_PRESETS_BY_FORMAT: Readonly<
  Record<string, string>
> = Object.freeze({
  aac: "aac-256kbps",
  aiff: "aiff-pcm24",
  flac: "flac-24bit",
  mp3: "mp3-320kbps",
  ogg: "ogg-opus-192kbps",
  wav: DEFAULT_AUDIO_TRANSCODE_PRESET,
});

const STANDARD_SAMPLE_RATES = Object.freeze([
  8_000, 16_000, 22_050, 24_000, 32_000, 44_100, 48_000, 88_200, 96_000,
  176_400, 192_000, 384_000,
]);

export interface AudioTranscodeTargetResolution {
  probeTarget: import("@echovisionlab/audio-transcoder").AudioStreamOutputProbeTarget;
  target: import("@echovisionlab/audio-transcoder").AudioStreamTarget;
}

export interface AudioTranscodeTargetResolutionError {
  message: string;
  reason:
    | "channels"
    | "format"
    | "parameters"
    | "preset"
    | "sample-rate"
    | "source-inspection";
}

export interface AudioTranscodeEncodingLabels {
  readonly bitDepth: string;
  readonly bitDepthContainerEffective: (
    containerBits: number,
    effectiveBits: number,
  ) => string;
  readonly bitrate: string;
  readonly codec: string;
  readonly constantBitrate: string;
  readonly float: string;
  readonly integer: string;
  readonly sampleFormat: string;
  readonly variableBitrate: string;
}

export interface AudioTranscodeEncodingControl {
  readonly id: AudioStreamOutputParameterId;
  readonly label: string;
  readonly options: readonly AudioTranscodeOption[];
  readonly value: string;
}

export interface AudioTranscodeSampleRateRow {
  readonly id: string;
  readonly inspection: AudioStreamInspection;
  readonly name: string;
}

export type AudioTranscodeSampleRateFailureReason =
  | AudioStreamOutputSampleRateOptionsErrorReason
  | AudioStreamOutputSampleRateUnsupportedReason
  | AudioTranscodeTargetResolutionError["reason"];

export interface AudioTranscodeSampleRateFailure {
  readonly id: string;
  readonly inspection: AudioStreamInspection;
  readonly name: string;
  readonly reason: AudioTranscodeSampleRateFailureReason;
}

export interface AudioTranscodeSampleRateOption extends AudioTranscodeOption {
  readonly supportedRowCount: number;
  readonly totalRowCount: number;
  readonly unavailableRows: readonly AudioTranscodeSampleRateFailure[];
}

export interface AudioTranscodeSampleRateLabels {
  readonly automatic: string;
  readonly availableFor: (supported: number, total: number) => string;
  readonly preserveSource: string;
  readonly unavailable: string;
}

export function getAudioTranscodeCapabilities(): AudioTranscoderStreamCapabilities {
  return AUDIO_TRANSCODER_STREAM_CAPABILITIES;
}

export function getAudioTranscodePresetDescriptors(
  capabilities: AudioTranscoderStreamCapabilities = AUDIO_TRANSCODER_STREAM_CAPABILITIES,
): readonly AudioStreamOutputPresetDescriptor[] {
  return capabilities.outputFormats.flatMap((format) => format.presets);
}

export function getAudioTranscodeFormatDescriptors(
  capabilities: AudioTranscoderStreamCapabilities = AUDIO_TRANSCODER_STREAM_CAPABILITIES,
): readonly AudioStreamOutputFormatDescriptor[] {
  return capabilities.outputFormats.filter(
    (format) => format.presets.length > 0,
  );
}

export function findAudioTranscodeFormat(
  formatId: string,
  capabilities: AudioTranscoderStreamCapabilities = AUDIO_TRANSCODER_STREAM_CAPABILITIES,
): AudioStreamOutputFormatDescriptor | null {
  return (
    getAudioTranscodeFormatDescriptors(capabilities).find(
      (format) => format.id === formatId,
    ) ?? null
  );
}

export function findAudioTranscodePreset(
  presetId: string,
  capabilities: AudioTranscoderStreamCapabilities = AUDIO_TRANSCODER_STREAM_CAPABILITIES,
): AudioStreamOutputPresetDescriptor | null {
  return (
    getAudioTranscodePresetDescriptors(capabilities).find(
      (descriptor) => descriptor.preset.id === presetId,
    ) ?? null
  );
}

export function buildAudioTranscodeAccept(
  capabilities: AudioTranscoderStreamCapabilities = AUDIO_TRANSCODER_STREAM_CAPABILITIES,
): string {
  const hints = new Set<string>();
  for (const format of capabilities.inputFormats) {
    for (const mimeType of format.mimeTypeHints) {
      hints.add(mimeType);
    }
    for (const extension of format.extensionHints) {
      hints.add(`.${extension}`);
    }
  }
  return [...hints].join(",");
}

export function buildAudioTranscodeFormatOptions(
  capabilities: AudioTranscoderStreamCapabilities = AUDIO_TRANSCODER_STREAM_CAPABILITIES,
): readonly AudioTranscodeOption[] {
  return getAudioTranscodeFormatDescriptors(capabilities).map((format) => ({
    value: format.id,
    label:
      format.id === "aac"
        ? "AAC (.aac, ADTS)"
        : format.id === "ogg"
          ? "Ogg Opus"
          : format.container.toUpperCase(),
  }));
}

export function buildAudioTranscodeEncodingControls(
  formatId: string,
  presetId: string,
  labels: AudioTranscodeEncodingLabels,
  capabilities: AudioTranscoderStreamCapabilities = AUDIO_TRANSCODER_STREAM_CAPABILITIES,
): readonly AudioTranscodeEncodingControl[] {
  const selected = getAudioStreamOutputEncodingOptions(
    formatId,
    capabilities,
  ).find((option) => option.presetId === presetId);
  if (selected === undefined) {
    return [];
  }

  const prefix: Record<string, AudioStreamOutputParameterValue> = {};
  return getAudioStreamOutputParameters(formatId, {}, capabilities).map(
    ({ id }) => {
      const descriptor = getAudioStreamOutputParameters(
        formatId,
        toParameterSelection(prefix),
        capabilities,
      ).find((candidate) => candidate.id === id);
      const selectedValue = encodingParameterValue(selected, id);
      const options = (descriptor?.options ?? []).map(
        ({ presetIds, value }) => ({
          value: String(value),
          label: formatEncodingParameterValue(
            id,
            value,
            presetIds,
            labels,
            capabilities,
          ),
        }),
      );
      if (selectedValue !== null) {
        prefix[id] = selectedValue;
      }
      return {
        id,
        label: encodingParameterLabel(id, labels),
        options,
        value: selectedValue === null ? "" : String(selectedValue),
      };
    },
  );
}

export function selectAudioTranscodeEncodingPreset(
  formatId: string,
  currentPresetId: string,
  parameterId: AudioStreamOutputParameterId,
  value: string,
  capabilities: AudioTranscoderStreamCapabilities = AUDIO_TRANSCODER_STREAM_CAPABILITIES,
): AudioStreamOutputPresetDescriptor | null {
  const controls = getAudioStreamOutputParameters(formatId, {}, capabilities);
  const parameter = controls.find(({ id }) => id === parameterId);
  const option = parameter?.options.find(
    (candidate) => String(candidate.value) === value,
  );
  if (option === undefined) {
    return null;
  }

  if (option.presetIds.includes(currentPresetId)) {
    return findAudioTranscodePreset(currentPresetId, capabilities);
  }

  const preferred = getDefaultAudioTranscodePreset(formatId, capabilities);
  const nextPresetId =
    preferred !== null && option.presetIds.includes(preferred.preset.id)
      ? preferred.preset.id
      : option.presetIds[0];
  return nextPresetId === undefined
    ? null
    : findAudioTranscodePreset(nextPresetId, capabilities);
}

export function getDefaultAudioTranscodePreset(
  formatId: string,
  capabilities: AudioTranscoderStreamCapabilities = AUDIO_TRANSCODER_STREAM_CAPABILITIES,
): AudioStreamOutputPresetDescriptor | null {
  const format = findAudioTranscodeFormat(formatId, capabilities);
  if (format === null) {
    return null;
  }

  const preferredPresetId =
    DEFAULT_AUDIO_TRANSCODE_PRESETS_BY_FORMAT[format.id];
  return (
    format.presets.find(
      (descriptor) => descriptor.preset.id === preferredPresetId,
    ) ??
    format.presets[0] ??
    null
  );
}

export function buildAudioTranscodeSampleRateOptions(
  formatId: string,
  descriptor: AudioStreamOutputPresetDescriptor,
  rows: readonly AudioTranscodeSampleRateRow[],
  labels: AudioTranscodeSampleRateLabels,
  capabilities: AudioTranscoderStreamCapabilities = AUDIO_TRANSCODER_STREAM_CAPABILITIES,
): readonly AudioTranscodeSampleRateOption[] {
  if (rows.length === 0) {
    const sampleRateConstraint = descriptor.target.sampleRate;
    const rates =
      sampleRateConstraint.kind === "discrete"
        ? sampleRateConstraint.values
        : STANDARD_SAMPLE_RATES.filter(
            (rate) =>
              rate >= sampleRateConstraint.minimum &&
              rate <= sampleRateConstraint.maximum,
          );
    return [
      emptySampleRateOption(AUDIO_TRANSCODE_AUTOMATIC_VALUE, labels.automatic),
      emptySampleRateOption(
        AUDIO_TRANSCODE_SOURCE_VALUE,
        labels.preserveSource,
      ),
      ...rates.map((rate) =>
        emptySampleRateOption(String(rate), formatSampleRate(rate)),
      ),
    ];
  }

  const optionResults = rows.map((row) => ({
    row,
    result: getAudioStreamOutputSampleRateOptions(
      {
        candidateSampleRates:
          descriptor.target.sampleRate.kind === "range"
            ? STANDARD_SAMPLE_RATES
            : undefined,
        formatId,
        presetId: descriptor.preset.id,
      },
      row.inspection,
      capabilities,
    ),
  }));
  const rates = new Set<number>();
  for (const { result } of optionResults) {
    if (result.status === "resolved") {
      for (const option of result.options) {
        rates.add(option.sampleRate);
      }
    }
  }

  const automatic = buildSourceAwareSampleRateOption(
    AUDIO_TRANSCODE_AUTOMATIC_VALUE,
    labels.automatic,
    formatId,
    descriptor,
    rows,
    labels,
    capabilities,
  );
  const preserveSource = buildSourceAwareSampleRateOption(
    AUDIO_TRANSCODE_SOURCE_VALUE,
    labels.preserveSource,
    formatId,
    descriptor,
    rows,
    labels,
    capabilities,
  );
  const explicitRates = [...rates]
    .sort((left, right) => left - right)
    .map((rate) => {
      const unavailableRows =
        optionResults.flatMap<AudioTranscodeSampleRateFailure>(
          ({ result, row }) => {
            if (result.status === "unsupported") {
              return [{ ...row, reason: result.reason }];
            }
            const option = result.options.find(
              (candidate) => candidate.sampleRate === rate,
            );
            return option?.status === "supported"
              ? []
              : [{ ...row, reason: option?.reason ?? "preset-sample-rate" }];
          },
        );
      return completeSampleRateOption(
        String(rate),
        formatSampleRate(rate),
        rows,
        unavailableRows,
        labels,
      );
    });

  return [automatic, preserveSource, ...explicitRates];
}

export function resolveAudioTranscodeTarget(
  formatId: string,
  presetId: string,
  inspection: AudioStreamInspection,
  sampleRateValue: string,
  capabilities: AudioTranscoderStreamCapabilities = AUDIO_TRANSCODER_STREAM_CAPABILITIES,
): AudioTranscodeTargetResolution | AudioTranscodeTargetResolutionError {
  const sampleRate: AudioStreamSourceAwareSampleRateSelection =
    sampleRateValue === AUDIO_TRANSCODE_SOURCE_VALUE ||
    sampleRateValue === AUDIO_TRANSCODE_AUTOMATIC_VALUE
      ? sampleRateValue
      : Number(sampleRateValue);
  const resolved = resolveAudioStreamSourceAwareFormatTarget(
    {
      formatId,
      presetId,
      sampleRate,
    },
    inspection,
    capabilities,
  );
  return resolved.status === "resolved"
    ? { probeTarget: resolved.probeTarget, target: resolved.target }
    : { message: resolved.message, reason: resolved.reason };
}

export function formatAudioTranscodeBitrate(
  descriptor: AudioStreamOutputPresetDescriptor,
): string {
  if (descriptor.kind === "lossy") {
    return `${Math.round(descriptor.bitrate / 1_000)} kbps ${descriptor.bitrateMode === "variable" ? "VBR" : "CBR"}`;
  }
  if (descriptor.preset.sampleFormat === "float") {
    return `${descriptor.preset.bitDepth}-bit float`;
  }

  const precisionSuffix =
    descriptor.processingPrecision.effectiveIntegerPrecisionBits <
    descriptor.preset.bitDepth
      ? ` (≤${descriptor.processingPrecision.effectiveIntegerPrecisionBits}-bit)`
      : "";
  return descriptor.preset.container === "wav"
    ? `PCM ${descriptor.preset.bitDepth}-bit${precisionSuffix}`
    : `${descriptor.preset.bitDepth}-bit${precisionSuffix}`;
}

export function formatAudioTranscodePreset(
  descriptor: AudioStreamOutputPresetDescriptor,
): string {
  const formatLabel = descriptor.preset.id.startsWith("aac-")
    ? "AAC (.aac, ADTS)"
    : descriptor.preset.id.startsWith("ogg-opus-")
      ? "Ogg Opus"
      : descriptor.preset.container.toUpperCase();
  return `${formatLabel} · ${formatAudioTranscodeBitrate(descriptor)}`;
}

export function formatSampleRate(sampleRate: number): string {
  const kilohertz = sampleRate / 1_000;
  return `${Number.isInteger(kilohertz) ? kilohertz : kilohertz.toFixed(2).replace(/0+$/, "")} kHz`;
}

export function formatAudioBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1_024)),
  );
  const value = bytes / 1_024 ** unitIndex;
  const precision = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision).replace(/\.0+$|(?<=\.[0-9])0+$/, "")} ${units[unitIndex]}`;
}

function toParameterSelection(
  values: Readonly<Record<string, AudioStreamOutputParameterValue>>,
): import("@echovisionlab/audio-transcoder").AudioStreamOutputParameterSelection {
  return {
    ...(typeof values["bit-depth"] === "number"
      ? { bitDepth: values["bit-depth"] }
      : {}),
    ...(typeof values["bitrate-bps"] === "number"
      ? { bitrateBps: values["bitrate-bps"] }
      : {}),
    ...(typeof values.codec === "string" ? { codec: values.codec } : {}),
    ...(values["sample-format"] === "float" ||
    values["sample-format"] === "integer" ||
    values["sample-format"] === "lossy"
      ? { sampleFormat: values["sample-format"] }
      : {}),
  };
}

function encodingParameterValue(
  option: import("@echovisionlab/audio-transcoder").AudioStreamOutputEncodingOption,
  id: AudioStreamOutputParameterId,
): AudioStreamOutputParameterValue | null {
  switch (id) {
    case "bit-depth":
      return option.bitDepth;
    case "bitrate-bps":
      return option.bitrateBps;
    case "codec":
      return option.codec;
    case "sample-format":
      return option.sampleFormat;
  }
}

function encodingParameterLabel(
  id: AudioStreamOutputParameterId,
  labels: AudioTranscodeEncodingLabels,
): string {
  switch (id) {
    case "bit-depth":
      return labels.bitDepth;
    case "bitrate-bps":
      return labels.bitrate;
    case "codec":
      return labels.codec;
    case "sample-format":
      return labels.sampleFormat;
  }
}

function formatEncodingParameterValue(
  id: AudioStreamOutputParameterId,
  value: AudioStreamOutputParameterValue,
  presetIds: readonly string[],
  labels: AudioTranscodeEncodingLabels,
  capabilities: AudioTranscoderStreamCapabilities,
): string {
  switch (id) {
    case "bit-depth": {
      const descriptor = presetIds
        .map((presetId) => findAudioTranscodePreset(presetId, capabilities))
        .find(Boolean);
      if (
        descriptor?.kind === "lossless" &&
        descriptor.preset.sampleFormat === "integer" &&
        descriptor.processingPrecision.effectiveIntegerPrecisionBits <
          Number(value)
      ) {
        return labels.bitDepthContainerEffective(
          Number(value),
          descriptor.processingPrecision.effectiveIntegerPrecisionBits,
        );
      }
      return `${value}-bit`;
    }
    case "bitrate-bps": {
      const descriptor = presetIds
        .map((presetId) => findAudioTranscodePreset(presetId, capabilities))
        .find(Boolean);
      const mode = descriptor?.kind === "lossy" ? descriptor.bitrateMode : null;
      return `${Math.round(Number(value) / 1_000)} kbps${
        mode === null
          ? ""
          : ` · ${mode === "variable" ? labels.variableBitrate : labels.constantBitrate}`
      }`;
    }
    case "codec":
      return String(value).toUpperCase();
    case "sample-format":
      return value === "float"
        ? labels.float
        : value === "integer"
          ? labels.integer
          : String(value);
  }
}

function emptySampleRateOption(
  value: string,
  label: string,
): AudioTranscodeSampleRateOption {
  return {
    disabled: false,
    label,
    supportedRowCount: 0,
    totalRowCount: 0,
    unavailableRows: [],
    value,
  };
}

function buildSourceAwareSampleRateOption(
  value:
    | typeof AUDIO_TRANSCODE_AUTOMATIC_VALUE
    | typeof AUDIO_TRANSCODE_SOURCE_VALUE,
  label: string,
  formatId: string,
  descriptor: AudioStreamOutputPresetDescriptor,
  rows: readonly AudioTranscodeSampleRateRow[],
  labels: AudioTranscodeSampleRateLabels,
  capabilities: AudioTranscoderStreamCapabilities,
): AudioTranscodeSampleRateOption {
  const unavailableRows = rows.flatMap<AudioTranscodeSampleRateFailure>(
    (row) => {
      const resolved = resolveAudioStreamSourceAwareFormatTarget(
        { formatId, presetId: descriptor.preset.id, sampleRate: value },
        row.inspection,
        capabilities,
      );
      return resolved.status === "resolved"
        ? []
        : [{ ...row, reason: resolved.reason }];
    },
  );
  return completeSampleRateOption(value, label, rows, unavailableRows, labels);
}

function completeSampleRateOption(
  value: string,
  label: string,
  rows: readonly AudioTranscodeSampleRateRow[],
  unavailableRows: readonly AudioTranscodeSampleRateFailure[],
  labels: AudioTranscodeSampleRateLabels,
): AudioTranscodeSampleRateOption {
  const supportedRowCount = rows.length - unavailableRows.length;
  const availability =
    supportedRowCount === 0
      ? labels.unavailable
      : supportedRowCount < rows.length
        ? labels.availableFor(supportedRowCount, rows.length)
        : null;
  return {
    disabled: supportedRowCount === 0,
    label: availability === null ? label : `${label} · ${availability}`,
    supportedRowCount,
    totalRowCount: rows.length,
    unavailableRows,
    value,
  };
}
