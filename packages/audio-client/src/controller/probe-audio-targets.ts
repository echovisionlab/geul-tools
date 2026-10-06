import type { AudioStreamInspection } from "@echovisionlab/audio-transcoder";
import {
  getAudioTranscodeCapabilities,
  resolveAudioTranscodeTarget,
} from "../audio-transcode-model";
import type { AudioTranscoderRuntime } from "../audio-transcoder-runtime";
import type { AudioTranscodeRow } from "./audio-transcode-controller-model";

type TargetFailureReason = Extract<
  ReturnType<typeof resolveAudioTranscodeTarget>,
  { reason: unknown }
>["reason"];

interface Messages {
  engineUnavailable: string;
  probeFailed: string;
  targetFailure: (
    reason: TargetFailureReason,
    inspection: AudioStreamInspection,
  ) => string;
}

interface Options {
  rows: readonly AudioTranscodeRow[];
  candidates: readonly AudioTranscodeRow[];
  capabilities: ReturnType<typeof getAudioTranscodeCapabilities>;
  format: Parameters<typeof resolveAudioTranscodeTarget>[0];
  selectedPresetId: string;
  sampleRate: string;
  signal: AbortSignal;
  getRuntime: () => AudioTranscoderRuntime;
  updateRows: (
    updater: (
      current: readonly AudioTranscodeRow[],
    ) => readonly AudioTranscodeRow[],
  ) => void;
  messages: Messages;
}

export async function probeAudioTargets({
  rows,
  candidates,
  capabilities,
  format,
  selectedPresetId,
  sampleRate,
  signal,
  getRuntime,
  updateRows,
  messages,
}: Options): Promise<number | null> {
  let failures = rows.filter(
    (row) =>
      !row.outputSupported &&
      !candidates.some((candidate) => candidate.id === row.id),
  ).length;

  for (const candidate of candidates) {
    if (signal.aborted || candidate.inspection === null) {
      return null;
    }
    const inspection = candidate.inspection;
    const resolved = resolveAudioTranscodeTarget(
      format,
      selectedPresetId,
      inspection,
      sampleRate,
      capabilities,
    );
    if ("reason" in resolved) {
      failures += 1;
      updateRows((current) =>
        current.map((row) =>
          row.id === candidate.id
            ? {
                ...row,
                message: messages.targetFailure(resolved.reason, inspection),
                outputSupported: false,
              }
            : row,
        ),
      );
      continue;
    }

    try {
      const support = await getRuntime().probeOutput(resolved.probeTarget, {
        signal,
      });
      if (signal.aborted) {
        return null;
      }
      const supported = support.status === "supported";
      if (!supported) {
        failures += 1;
      }
      updateRows((current) =>
        current.map((row) =>
          row.id === candidate.id
            ? {
                ...row,
                message: supported
                  ? null
                  : support.status === "runtime-unavailable"
                    ? messages.engineUnavailable
                    : messages.targetFailure(support.reason, inspection),
                outputSupported: supported,
                status:
                  support.status === "runtime-unavailable" ? "error" : "ready",
              }
            : row,
        ),
      );
    } catch {
      if (signal.aborted) {
        return null;
      }
      failures += 1;
      updateRows((current) =>
        current.map((row) =>
          row.id === candidate.id
            ? {
                ...row,
                message: messages.probeFailed,
                outputSupported: false,
                status: "error",
              }
            : row,
        ),
      );
    }
  }

  return signal.aborted ? null : failures;
}
