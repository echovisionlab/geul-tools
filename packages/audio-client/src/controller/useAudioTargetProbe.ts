import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import type { useTranslations } from "use-intl";
import {
  formatAudioTranscodePreset,
  type findAudioTranscodePreset,
  type getAudioTranscodeCapabilities,
} from "../audio-transcode-model";
import type { AudioTranscoderRuntime } from "../audio-transcoder-runtime";
import type { AudioTranscodeTargetStatus } from "../ui";
import type { AudioTranscodeRow } from "./audio-transcode-controller-model";
import { formatTargetFailureMessage } from "./audio-transcode-view-model";
import { probeAudioTargets } from "./probe-audio-targets";

interface Options {
  rows: readonly AudioTranscodeRow[];
  rowsRef: RefObject<readonly AudioTranscodeRow[]>;
  controllerRef: RefObject<AbortController | null>;
  descriptor: ReturnType<typeof findAudioTranscodePreset>;
  capabilities: ReturnType<typeof getAudioTranscodeCapabilities>;
  format: string;
  selectedPresetId: string;
  sampleRate: string;
  getRuntime: () => AudioTranscoderRuntime;
  updateRows: (
    updater: (
      current: readonly AudioTranscodeRow[],
    ) => readonly AudioTranscodeRow[],
  ) => void;
  t: ReturnType<typeof useTranslations<"tools.transcode">>;
}

export function useAudioTargetProbe({
  rows,
  rowsRef,
  controllerRef,
  descriptor,
  capabilities,
  format,
  selectedPresetId,
  sampleRate,
  getRuntime,
  updateRows,
  t,
}: Options) {
  const [status, setStatus] = useState<AudioTranscodeTargetStatus>("idle");
  const [message, setMessage] = useState<string | null>(
    t("targetWaitingForFiles"),
  );
  const [nonce, setNonce] = useState(0);
  const inspectionKey = useMemo(
    () =>
      rows
        .filter((row) => row.inspection !== null)
        .map(
          (row) =>
            `${row.id}:${row.inspection?.sampleRate ?? "x"}:${row.inspection?.channels ?? "x"}`,
        )
        .join("|"),
    [rows],
  );

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    const targetRows = rowsRef.current.filter(
      (row) => row.inspection !== null && row.status !== "unsupported",
    );
    if (targetRows.length === 0 || descriptor === null) {
      setStatus("idle");
      setMessage(t("targetWaitingForFiles"));
      return;
    }

    const candidates = targetRows.filter(
      (row) => row.status === "ready" && !row.outputSupported,
    );
    if (candidates.length === 0) {
      const failures = targetRows.filter((row) => !row.outputSupported).length;
      setStatus(failures > 0 ? "error" : "ready");
      setMessage(
        failures > 0
          ? t("targetAvailability", {
              available: targetRows.length - failures,
              unavailable: failures,
            })
          : null,
      );
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus("checking");
    setMessage(t("targetCheckingMessage"));

    void probeAudioTargets({
      rows: targetRows,
      candidates,
      capabilities,
      format,
      selectedPresetId,
      sampleRate,
      signal: controller.signal,
      getRuntime,
      updateRows,
      messages: {
        engineUnavailable: t("outputEngineUnavailable", {
          preset: formatAudioTranscodePreset(descriptor),
        }),
        probeFailed: t("outputProbeFailed"),
        targetFailure: (reason, inspection) =>
          formatTargetFailureMessage(
            reason,
            inspection,
            descriptor,
            sampleRate,
            capabilities,
            t,
          ),
      },
    }).then((failures) => {
      if (failures === null) {
        return;
      }
      setStatus(failures === 0 ? "ready" : "error");
      setMessage(
        failures === 0
          ? null
          : t("targetAvailability", {
              available: targetRows.length - failures,
              unavailable: failures,
            }),
      );
    });

    return () => {
      controller.abort();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [
    capabilities,
    controllerRef,
    descriptor,
    format,
    getRuntime,
    inspectionKey,
    nonce,
    rowsRef,
    sampleRate,
    selectedPresetId,
    t,
    updateRows,
  ]);

  const reprobe = useCallback(() => setNonce((value) => value + 1), []);
  return { status, message, reprobe };
}
