import { useCallback, type RefObject } from "react";
import type { useTranslations } from "use-intl";
import type {
  AudioTranscoderInputSource,
  AudioTranscoderRuntime,
} from "../audio-transcoder-runtime";
import { isResourceLimitError } from "./audio-transcode-errors";
import type { AudioTranscodeRow } from "./audio-transcode-controller-model";

interface Options {
  controllersRef: RefObject<Map<string, AbortController>>;
  disposedRef: RefObject<boolean>;
  getRuntime: () => AudioTranscoderRuntime;
  updateRows: (
    updater: (
      current: readonly AudioTranscodeRow[],
    ) => readonly AudioTranscodeRow[],
  ) => void;
  setStatusMessage: (message: string) => void;
  t: ReturnType<typeof useTranslations<"tools.transcode">>;
}

export function useAudioRowInspection({
  controllersRef,
  disposedRef,
  getRuntime,
  updateRows,
  setStatusMessage,
  t,
}: Options) {
  return useCallback(
    async (id: string, source: AudioTranscoderInputSource) => {
      controllersRef.current.get(id)?.abort();
      const controller = new AbortController();
      controllersRef.current.set(id, controller);
      updateRows((current) =>
        current.map((row) =>
          row.id === id
            ? {
                ...row,
                inspection: null,
                message: null,
                outputSupported: false,
                status: "inspecting",
              }
            : row,
        ),
      );

      try {
        const support = await getRuntime().probeInput(source, {
          signal: controller.signal,
        });
        if (controller.signal.aborted || disposedRef.current) {
          return;
        }

        if (support.status === "supported") {
          updateRows((current) =>
            current.map((row) =>
              row.id === id
                ? {
                    ...row,
                    inspection: support.inspection,
                    message: null,
                    outputSupported: false,
                    status: "ready",
                  }
                : row,
            ),
          );
          setStatusMessage(t("statusReady"));
          return;
        }

        const message =
          support.status === "recognized-unsupported"
            ? t("unsupportedCodec")
            : t("unsupportedInput");
        updateRows((current) =>
          current.map((row) =>
            row.id === id
              ? {
                  ...row,
                  inspection: support.inspection,
                  message,
                  outputSupported: false,
                  status: "unsupported",
                }
              : row,
          ),
        );
        setStatusMessage(message);
      } catch (error) {
        if (controller.signal.aborted || disposedRef.current) {
          return;
        }
        const message = isResourceLimitError(error)
          ? t("inspectionInconclusive")
          : t("inspectionFailed");
        updateRows((current) =>
          current.map((row) =>
            row.id === id
              ? { ...row, message, outputSupported: false, status: "error" }
              : row,
          ),
        );
        setStatusMessage(message);
      } finally {
        if (controllersRef.current.get(id) === controller) {
          controllersRef.current.delete(id);
        }
      }
    },
    [controllersRef, disposedRef, getRuntime, setStatusMessage, t, updateRows],
  );
}
