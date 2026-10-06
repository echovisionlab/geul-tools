import type {
  AudioStreamInspection,
  AudioStreamProgressPhase,
} from "@echovisionlab/audio-transcoder";
import type { useTranslations } from "use-intl";
import {
  AUDIO_TRANSCODE_AUTOMATIC_VALUE,
  AUDIO_TRANSCODE_SOURCE_VALUE,
  findAudioTranscodePreset,
  formatAudioBytes,
  formatAudioTranscodePreset,
  formatSampleRate,
  getAudioTranscodeCapabilities,
} from "../audio-transcode-model";
import type { AudioTranscoderDownloadArtifact } from "../audio-transcoder-runtime";
import type {
  AudioTranscodeFileStatus,
  AudioTranscodeFileViewModel,
} from "../ui";
import type { AudioTranscodeRow } from "./audio-transcode-controller-model";

type Translate = ReturnType<typeof useTranslations<"tools.transcode">>;

export function projectAudioTranscodeFile(
  row: AudioTranscodeRow,
  t: Translate,
): AudioTranscodeFileViewModel {
  const sourceSummary = row.inspection
    ? t("sourceSummary", {
        container:
          row.inspection.container ?? row.inspection.codec ?? t("unknownAudio"),
        sampleRate:
          row.inspection.sampleRate === null
            ? "—"
            : formatSampleRate(row.inspection.sampleRate),
        channels: formatChannelLabel(row.inspection.channels, t),
        bitDepth: formatSourceEncoding(row.inspection, t),
      })
    : statusLabel(row.status, t);
  const outputSummary = row.artifact
    ? t("outputSummary", {
        preset: findArtifactPresetLabel(row.artifact),
        size: formatAudioBytes(row.artifact.size),
      })
    : null;
  const progress = row.progress === null ? null : Math.round(row.progress);

  return {
    id: row.id,
    name: row.source.name,
    sizeLabel: formatAudioBytes(row.source.size),
    sourceSummary,
    outputSummary,
    status: row.status,
    statusLabel: statusLabel(row.status, t),
    message: row.message,
    messageIsError:
      row.message !== null &&
      (row.status === "error" ||
        row.status === "unsupported" ||
        (row.status === "ready" && !row.outputSupported)),
    progress,
    progressLabel:
      progress === null
        ? null
        : t("progressLabel", {
            phase: progressPhaseLabel(row.progressPhase ?? "prepare", t),
            progress,
          }),
    downloadHref: row.artifact?.url ?? null,
    canDownloadSource:
      row.source.downloadUrl !== undefined &&
      (row.status === "ready" || row.status === "complete"),
    downloadName: row.artifact?.name ?? null,
    canRetry: row.status === "error",
    canCancel:
      row.status === "inspecting" ||
      row.status === "queued" ||
      row.status === "converting",
    canRemove:
      row.status !== "inspecting" &&
      row.status !== "queued" &&
      row.status !== "converting",
  };
}

function formatChannelLabel(channels: number | null, t: Translate): string {
  if (channels === null) {
    return "—";
  }
  if (channels === 1) {
    return t("mono");
  }
  if (channels === 2) {
    return t("stereo");
  }
  return t("channelCount", { count: channels });
}

function formatSourceEncoding(
  inspection: AudioStreamInspection,
  t: Translate,
): string {
  const encoding = inspection.sourceEncoding;
  if (encoding?.kind === "pcm") {
    const bitDepth = encoding.bitDepth ?? inspection.bitDepth;
    if (bitDepth === null) {
      return encoding.sampleFormat === "float" ? t("float") : t("integer");
    }
    if (encoding.sampleFormat === "float") {
      return t("sourcePcmFloat", { bitDepth });
    }
    if (encoding.signedness === "signed") {
      return t("sourcePcmSignedInteger", { bitDepth });
    }
    if (encoding.signedness === "unsigned") {
      return t("sourcePcmUnsignedInteger", { bitDepth });
    }
    return t("sourcePcmInteger", { bitDepth });
  }
  if (encoding?.kind === "lossless-compressed") {
    return encoding.bitDepth === null
      ? encoding.codec
      : `${encoding.codec} · ${encoding.bitDepth}-bit`;
  }
  if (encoding?.kind === "lossy-compressed") {
    return encoding.estimatedBitrateBps === null
      ? encoding.codec
      : `${encoding.codec} · ${Math.round(encoding.estimatedBitrateBps / 1_000)} kbps`;
  }
  return inspection.bitDepth === null ? "—" : `${inspection.bitDepth}-bit`;
}

function statusLabel(status: AudioTranscodeFileStatus, t: Translate): string {
  const keys: Record<AudioTranscodeFileStatus, Parameters<typeof t>[0]> = {
    inspecting: "statusInspecting",
    ready: "statusReady",
    queued: "statusQueued",
    converting: "statusConverting",
    complete: "statusComplete",
    unsupported: "statusUnsupported",
    error: "statusError",
  };
  return t(keys[status]);
}

function findArtifactPresetLabel(
  artifact: AudioTranscoderDownloadArtifact,
): string {
  const descriptor = findAudioTranscodePreset(artifact.result.preset.id);
  return descriptor
    ? formatAudioTranscodePreset(descriptor)
    : artifact.result.preset.id;
}

export function formatTargetFailureMessage(
  reason:
    | "channels"
    | "format"
    | "parameters"
    | "preset"
    | "sample-rate"
    | "source-inspection",
  inspection: AudioStreamInspection,
  descriptor: NonNullable<ReturnType<typeof findAudioTranscodePreset>>,
  sampleRateValue: string,
  capabilities: ReturnType<typeof getAudioTranscodeCapabilities>,
  t: Translate,
): string {
  if (reason === "channels") {
    return t("outputChannelsUnsupported", {
      actual: inspection.channels ?? 0,
      maximum: Math.min(
        capabilities.limits.channels.maximum,
        descriptor.target.channels.maximum,
      ),
      minimum: Math.max(
        capabilities.limits.channels.minimum,
        descriptor.target.channels.minimum,
      ),
    });
  }
  if (reason === "source-inspection") {
    return t("sourceInspectionMissing");
  }
  if (reason !== "sample-rate") {
    return t("outputConfigurationUnavailable");
  }

  const sourceRate = inspection.sampleRate;
  const allowed = formatAllowedSampleRates(descriptor);
  if (sourceRate === null) {
    return t("sourceInspectionMissing");
  }
  if (sampleRateValue === AUDIO_TRANSCODE_SOURCE_VALUE) {
    return t("preserveSourceRateUnsupported", {
      allowed,
      sourceRate: formatSampleRate(sourceRate),
    });
  }

  const resampling = capabilities.limits.sampleRate.resampling;
  const requestedRate =
    sampleRateValue === AUDIO_TRANSCODE_AUTOMATIC_VALUE
      ? null
      : Number.parseInt(sampleRateValue, 10);
  const sourceSupportedByPreset = supportsDescriptorSampleRate(
    descriptor,
    sourceRate,
  );
  if (
    !sourceSupportedByPreset &&
    (sourceRate < resampling.minimum || sourceRate > resampling.maximum)
  ) {
    return t("sourceResamplingRateUnsupported", {
      maximum: formatSampleRate(resampling.maximum),
      minimum: formatSampleRate(resampling.minimum),
      sourceRate: formatSampleRate(sourceRate),
    });
  }
  if (
    requestedRate !== null &&
    requestedRate !== sourceRate &&
    (requestedRate < resampling.minimum || requestedRate > resampling.maximum)
  ) {
    return t("targetResamplingRateUnsupported", {
      maximum: formatSampleRate(resampling.maximum),
      minimum: formatSampleRate(resampling.minimum),
      targetRate: formatSampleRate(requestedRate),
    });
  }
  if (sampleRateValue === AUDIO_TRANSCODE_AUTOMATIC_VALUE) {
    return t("automaticRateUnavailable", {
      allowed,
      sourceRate: formatSampleRate(sourceRate),
    });
  }
  return t("presetRateUnsupported", {
    allowed,
    targetRate: formatSampleRate(requestedRate ?? sourceRate),
  });
}

function supportsDescriptorSampleRate(
  descriptor: NonNullable<ReturnType<typeof findAudioTranscodePreset>>,
  sampleRate: number,
): boolean {
  const constraint = descriptor.target.sampleRate;
  return constraint.kind === "discrete"
    ? constraint.values.includes(sampleRate)
    : sampleRate >= constraint.minimum && sampleRate <= constraint.maximum;
}

function formatAllowedSampleRates(
  descriptor: NonNullable<ReturnType<typeof findAudioTranscodePreset>>,
): string {
  const constraint = descriptor.target.sampleRate;
  return constraint.kind === "discrete"
    ? constraint.values.map(formatSampleRate).join(", ")
    : `${formatSampleRate(constraint.minimum)}–${formatSampleRate(constraint.maximum)}`;
}

function progressPhaseLabel(
  phase: AudioStreamProgressPhase,
  t: Translate,
): string {
  const keys: Record<AudioStreamProgressPhase, Parameters<typeof t>[0]> = {
    prepare: "phasePrepare",
    decode: "phaseDecode",
    encode: "phaseEncode",
    finalize: "phaseFinalize",
  };
  return t(keys[phase]);
}
