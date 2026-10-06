import {
  AUDIO_TRANSCODER_CODEC_ASSET_MANIFEST,
  type AudioStreamInspection,
} from "@echovisionlab/audio-transcoder";
import {
  findAudioTranscodePreset,
  getAudioTranscodeCapabilities,
  resolveAudioTranscodeTarget,
} from "../audio-transcode-model";
import type { AudioTranscoderRuntime } from "../audio-transcoder-runtime";
import {
  isAbortError,
  reportConversionFailure,
} from "./audio-transcode-errors";
import type {
  AudioTranscodeRow,
  ConversionMetrics,
  ConversionRun,
} from "./audio-transcode-controller-model";

type AudioTargetFailureReason = Extract<
  ReturnType<typeof resolveAudioTranscodeTarget>,
  { reason: unknown }
>["reason"];

interface Messages {
  cancelled: string;
  batchResult: (metrics: ConversionMetrics) => string;
  converting: (metrics: ConversionMetrics) => string;
  queued: (metrics: ConversionMetrics) => string;
  conversionFailure: (error: unknown) => string;
  targetFailure: (
    reason: AudioTargetFailureReason,
    inspection: AudioStreamInspection,
  ) => string;
}

interface Options {
  requestedIds: readonly string[];
  rowsRef: { current: readonly AudioTranscodeRow[] };
  conversionRunRef: { current: ConversionRun | null };
  descriptor: NonNullable<ReturnType<typeof findAudioTranscodePreset>>;
  capabilities: ReturnType<typeof getAudioTranscodeCapabilities>;
  format: Parameters<typeof resolveAudioTranscodeTarget>[0];
  selectedPresetId: string;
  sampleRate: string;
  getRuntime: () => AudioTranscoderRuntime;
  updateRows: (
    updater: (
      current: readonly AudioTranscodeRow[],
    ) => readonly AudioTranscodeRow[],
  ) => void;
  setStatusMessage: (message: string) => void;
  messages: Messages;
}

export async function runAudioConversionQueue({
  requestedIds,
  rowsRef,
  conversionRunRef,
  descriptor,
  capabilities,
  format,
  selectedPresetId,
  sampleRate,
  getRuntime,
  updateRows,
  setStatusMessage,
  messages,
}: Options) {
  if (conversionRunRef.current !== null) {
    return;
  }
  const ids = requestedIds.filter((id) => {
    const row = rowsRef.current.find((candidate) => candidate.id === id);
    return (
      (row?.status === "ready" || row?.status === "error") &&
      row.outputSupported
    );
  });
  if (ids.length === 0) {
    return;
  }

  const metrics: ConversionMetrics = {
    attempted: 0,
    eligible: ids.length,
    failed: 0,
    succeeded: 0,
    unavailable: rowsRef.current.filter(
      (row) => row.status !== "complete" && !ids.includes(row.id),
    ).length,
  };
  const run: ConversionRun = {
    active: null,
    cancelled: false,
    cancelledIds: new Set(),
    token: Symbol("audio-transcode-run"),
  };
  conversionRunRef.current = run;
  updateRows((current) =>
    current.map((row) =>
      ids.includes(row.id)
        ? {
            ...row,
            message: null,
            progress: 0,
            progressPhase: "prepare",
            status: "queued",
          }
        : row,
    ),
  );
  setStatusMessage(messages.queued(metrics));

  for (const id of ids) {
    if (run.cancelled || conversionRunRef.current?.token !== run.token) {
      break;
    }
    if (run.cancelledIds.has(id)) {
      continue;
    }
    const row = rowsRef.current.find((candidate) => candidate.id === id);
    if (row?.inspection === null || row === undefined) {
      continue;
    }
    const inspection = row.inspection;
    metrics.attempted += 1;
    const previousArtifact = row.artifact;
    const resolved = resolveAudioTranscodeTarget(
      format,
      selectedPresetId,
      inspection,
      sampleRate,
      capabilities,
    );
    if ("reason" in resolved) {
      metrics.failed += 1;
      updateRows((current) =>
        current.map((candidate) =>
          candidate.id === id
            ? {
                ...candidate,
                message: messages.targetFailure(resolved.reason, inspection),
                outputSupported: false,
                status: "error",
              }
            : candidate,
        ),
      );
      continue;
    }

    const controller = new AbortController();
    run.active = { id, controller };
    updateRows((current) =>
      current.map((candidate) =>
        candidate.id === id
          ? {
              ...candidate,
              progress: 0,
              progressPhase: "prepare",
              status: "converting",
            }
          : candidate,
      ),
    );
    setStatusMessage(messages.converting(metrics));

    try {
      const artifact = await getRuntime().transcode({
        source: row.source,
        target: resolved.target,
        signal: controller.signal,
        onProgress: (progress) => {
          updateRows((current) =>
            current.map((candidate) =>
              candidate.id === id
                ? {
                    ...candidate,
                    progress: progress.progress * 100,
                    progressPhase: progress.phase,
                    status: "converting",
                  }
                : candidate,
            ),
          );
        },
      });
      if (run.cancelled || run.cancelledIds.has(id)) {
        await artifact.dispose();
        updateRows((current) =>
          current.map((candidate) =>
            candidate.id === id
              ? {
                  ...candidate,
                  message: messages.cancelled,
                  progress: null,
                  progressPhase: null,
                  status: "ready",
                }
              : candidate,
          ),
        );
      } else {
        metrics.succeeded += 1;
        updateRows((current) =>
          current.map((candidate) =>
            candidate.id === id
              ? {
                  ...candidate,
                  artifact,
                  message: null,
                  progress: 100,
                  progressPhase: "finalize",
                  status: "complete",
                }
              : candidate,
          ),
        );
        if (previousArtifact !== null && previousArtifact !== artifact) {
          void previousArtifact.dispose().catch(() => undefined);
        }
      }
    } catch (error) {
      const cancelled = controller.signal.aborted || isAbortError(error);
      if (!cancelled) {
        metrics.failed += 1;
        reportConversionFailure(error, {
          engineVersion: AUDIO_TRANSCODER_CODEC_ASSET_MANIFEST.version,
          input: {
            bytes: row.source.size,
            channels: inspection.channels,
            codec: inspection.codec,
            container: inspection.container,
            sampleRate: inspection.sampleRate,
          },
          output: { format, preset: descriptor.preset.id, sampleRate },
        });
      }
      const failureMessage = messages.conversionFailure(error);
      updateRows((current) =>
        current.map((candidate) =>
          candidate.id === id
            ? {
                ...candidate,
                message: cancelled ? messages.cancelled : failureMessage,
                progress: null,
                progressPhase: null,
                status: cancelled ? "ready" : "error",
              }
            : candidate,
        ),
      );
      setStatusMessage(cancelled ? messages.cancelled : failureMessage);
    } finally {
      if (run.active?.id === id) {
        run.active = null;
      }
    }
  }

  if (conversionRunRef.current?.token === run.token) {
    conversionRunRef.current = null;
  }
  updateRows((current) =>
    current.map((row) =>
      row.status === "queued"
        ? {
            ...row,
            message: run.cancelled ? messages.cancelled : row.message,
            progress: null,
            progressPhase: null,
            status: "ready",
          }
        : row,
    ),
  );
  if (!run.cancelled) {
    setStatusMessage(messages.batchResult(metrics));
  }
}
