import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AUDIO_TRANSCODER_CODEC_ASSET_MANIFEST,
  type AudioStreamOutputParameterId,
} from "@echovisionlab/audio-transcoder";
import { useTranslations } from "use-intl";
import {
  AUDIO_TRANSCODE_AUTOMATIC_VALUE,
  DEFAULT_AUDIO_TRANSCODE_FORMAT,
  DEFAULT_AUDIO_TRANSCODE_PRESET,
  buildAudioTranscodeAccept,
  buildAudioTranscodeEncodingControls,
  buildAudioTranscodeFormatOptions,
  buildAudioTranscodeSampleRateOptions,
  findAudioTranscodePreset,
  getDefaultAudioTranscodePreset,
  getAudioTranscodeCapabilities,
  selectAudioTranscodeEncodingPreset,
} from "../audio-transcode-model";
import {
  AUDIO_TRANSCODER_FILE_CAPACITY,
  createAudioTranscoderRuntime,
  type AudioTranscoderInputSource,
} from "../audio-transcoder-runtime";
import {
  AudioTranscodeToolView,
  type AudioTranscodeToolLabels,
  type AudioTranscodeTargetStatus,
} from "../ui";
import { formatConversionFailureMessage } from "./audio-transcode-errors";
import type { AudioTranscodeRow } from "./audio-transcode-controller-model";
import {
  formatTargetFailureMessage,
  projectAudioTranscodeFile,
} from "./audio-transcode-view-model";
import { runAudioConversionQueue } from "./run-audio-conversion-queue";
import { downloadOriginalAudio } from "./download-original-audio";
import { useAudioRowInspection } from "./useAudioRowInspection";
import { useAudioTargetProbe } from "./useAudioTargetProbe";
import {
  useAudioTranscoderRuntime,
  type AudioTranscoderRuntimeFactory,
} from "./useAudioTranscoderRuntime";

export interface AudioTranscodeToolProps {
  /** Test seam. Production consumers use the package runtime. */
  runtimeFactory?: AudioTranscoderRuntimeFactory;
  /** Resolved consumer-owned HTTP input. Undefined keeps the local file-picker mode. */
  externalSource?:
    (AudioTranscoderInputSource & { readonly id: string }) | null;
  /** Consumer-specific initial output format; defaults to WAV when omitted. */
  initialFormat?: string;
  /** Null embeds the converter below another feature heading. */
  title?: string | null;
  onExternalSourceRemove?: (id: string) => void;
}

export function AudioTranscodeToolController({
  runtimeFactory = createAudioTranscoderRuntime,
  externalSource,
  initialFormat = DEFAULT_AUDIO_TRANSCODE_FORMAT,
  title,
  onExternalSourceRemove,
}: AudioTranscodeToolProps) {
  const t = useTranslations("tools.transcode");
  const capabilities = getAudioTranscodeCapabilities();
  const formatOptions = useMemo(
    () => buildAudioTranscodeFormatOptions(capabilities),
    [capabilities],
  );
  const accept = useMemo(
    () => buildAudioTranscodeAccept(capabilities),
    [capabilities],
  );
  const initialPreset = getDefaultAudioTranscodePreset(
    initialFormat,
    capabilities,
  );
  const [format, setFormat] = useState(
    initialPreset === null ? DEFAULT_AUDIO_TRANSCODE_FORMAT : initialFormat,
  );
  const [selectedPresetId, setSelectedPresetId] = useState(
    initialPreset?.preset.id ?? DEFAULT_AUDIO_TRANSCODE_PRESET,
  );
  const [sampleRate, setSampleRate] = useState<string>(
    AUDIO_TRANSCODE_AUTOMATIC_VALUE,
  );
  const [rows, setRowsState] = useState<readonly AudioTranscodeRow[]>([]);
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const rowsRef = useRef(rows);
  const sourceDownloadRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => sourceDownloadRef.current?.abort(),
    [externalSource?.id],
  );
  const nextIdRef = useRef(1);
  const externalSourceIdRef = useRef<string | null>(null);
  const {
    assetState,
    getRuntime,
    inspectionControllersRef,
    targetProbeControllerRef,
    conversionRunRef,
    disposedRef,
  } = useAudioTranscoderRuntime(runtimeFactory);

  const descriptor = useMemo(
    () => findAudioTranscodePreset(selectedPresetId, capabilities),
    [capabilities, selectedPresetId],
  );
  const encodingControls = useMemo(
    () =>
      buildAudioTranscodeEncodingControls(
        format,
        selectedPresetId,
        {
          bitDepth: t("bitDepth"),
          bitDepthContainerEffective: (containerBits, effectiveBits) =>
            t("bitDepthContainerEffective", { containerBits, effectiveBits }),
          bitrate: t("bitrate"),
          codec: t("codec"),
          constantBitrate: t("constantBitrate"),
          float: t("float"),
          integer: t("integer"),
          sampleFormat: t("sampleFormat"),
          variableBitrate: t("variableBitrate"),
        },
        capabilities,
      ),
    [capabilities, format, selectedPresetId, t],
  );
  const sampleRateOptions = useMemo(
    () =>
      descriptor
        ? buildAudioTranscodeSampleRateOptions(
            format,
            descriptor,
            rows.flatMap((row) =>
              row.inspection === null || row.status === "unsupported"
                ? []
                : [
                    {
                      id: row.id,
                      inspection: row.inspection,
                      name: row.source.name,
                    },
                  ],
            ),
            {
              automatic: t("automatic"),
              availableFor: (supported, total) =>
                t("sampleRateAvailableFor", { supported, total }),
              preserveSource: t("preserveSource"),
              unavailable: t("unavailable"),
            },
            capabilities,
          )
        : [],
    [capabilities, descriptor, format, rows, t],
  );

  const updateRows = useCallback(
    (
      updater: (
        current: readonly AudioTranscodeRow[],
      ) => readonly AudioTranscodeRow[],
    ) => {
      setRowsState((current) => {
        const next = updater(current);
        rowsRef.current = next;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    const selectedOption = sampleRateOptions.find(
      (option) => option.value === sampleRate,
    );
    if (
      sampleRate !== AUDIO_TRANSCODE_AUTOMATIC_VALUE &&
      (selectedOption === undefined || selectedOption.disabled === true)
    ) {
      for (const row of rowsRef.current) {
        void row.artifact?.dispose().catch(() => undefined);
      }
      updateRows((current) =>
        current.map((row) =>
          row.inspection === null
            ? row
            : {
                ...row,
                artifact: null,
                message: null,
                outputSupported: false,
                progress: null,
                progressPhase: null,
                status: row.status === "unsupported" ? row.status : "ready",
              },
        ),
      );
      setSampleRate(AUDIO_TRANSCODE_AUTOMATIC_VALUE);
      const notice = t("sampleRateResetAutomatic");
      setSettingsNotice(notice);
      setStatusMessage(notice);
    }
    if (descriptor === null) {
      const defaultDescriptor = getDefaultAudioTranscodePreset(
        format,
        capabilities,
      );
      if (defaultDescriptor !== null) {
        setSelectedPresetId(defaultDescriptor.preset.id);
      }
    }
  }, [
    capabilities,
    descriptor,
    format,
    sampleRate,
    sampleRateOptions,
    t,
    updateRows,
  ]);

  const inspectRow = useAudioRowInspection({
    controllersRef: inspectionControllersRef,
    disposedRef,
    getRuntime,
    updateRows,
    setStatusMessage,
    t,
  });

  const {
    status: targetStatus,
    message: targetMessage,
    reprobe: reprobeTarget,
  } = useAudioTargetProbe({
    rows,
    rowsRef,
    controllerRef: targetProbeControllerRef,
    descriptor,
    capabilities,
    format,
    selectedPresetId,
    sampleRate,
    getRuntime,
    updateRows,
    t,
  });

  const handleFilesSelected = useCallback(
    (files: readonly File[]) => {
      const available = Math.max(
        0,
        AUDIO_TRANSCODER_FILE_CAPACITY - rowsRef.current.length,
      );
      const accepted = files.slice(0, available);
      const rejectedCount = files.length - accepted.length;
      setCapacityError(
        rejectedCount > 0
          ? t("capacityExceeded", {
              count: rejectedCount,
              max: AUDIO_TRANSCODER_FILE_CAPACITY,
            })
          : null,
      );
      if (accepted.length === 0) {
        return;
      }

      const additions = accepted.map<AudioTranscodeRow>((file) => ({
        id: `audio-${nextIdRef.current++}`,
        source: {
          input: { blob: file, name: file.name },
          name: file.name,
          size: file.size,
        },
        inspection: null,
        artifact: null,
        status: "inspecting",
        message: null,
        outputSupported: false,
        progress: null,
        progressPhase: null,
      }));
      updateRows((current) => [...current, ...additions]);
      setStatusMessage(t("statusInspectionQueued"));
      for (const row of additions) {
        void inspectRow(row.id, row.source);
      }
    },
    [inspectRow, t, updateRows],
  );

  useEffect(() => {
    if (externalSource === undefined) {
      return;
    }
    if (externalSource === null) {
      if (externalSourceIdRef.current === null) {
        return;
      }
      for (const controller of inspectionControllersRef.current.values()) {
        controller.abort();
      }
      inspectionControllersRef.current.clear();
      for (const row of rowsRef.current) {
        void row.artifact?.dispose().catch(() => undefined);
      }
      externalSourceIdRef.current = null;
      updateRows(() => []);
      return;
    }
    if (externalSourceIdRef.current === externalSource.id) {
      return;
    }

    for (const controller of inspectionControllersRef.current.values()) {
      controller.abort();
    }
    inspectionControllersRef.current.clear();
    for (const row of rowsRef.current) {
      void row.artifact?.dispose().catch(() => undefined);
    }
    const row: AudioTranscodeRow = {
      id: externalSource.id,
      source: externalSource,
      inspection: null,
      artifact: null,
      status: "inspecting",
      message: null,
      outputSupported: false,
      progress: null,
      progressPhase: null,
    };
    externalSourceIdRef.current = externalSource.id;
    updateRows(() => [row]);
    setCapacityError(null);
    setStatusMessage(t("statusInspectionQueued"));
    void inspectRow(row.id, row.source);
  }, [externalSource, inspectRow, inspectionControllersRef, t, updateRows]);

  const resetOutputsForTargetChange = useCallback(() => {
    if (
      rowsRef.current.some(
        (row) => row.status === "queued" || row.status === "converting",
      )
    ) {
      return false;
    }
    for (const row of rowsRef.current) {
      void row.artifact?.dispose().catch(() => undefined);
    }
    updateRows((current) =>
      current.map((row) =>
        row.inspection === null
          ? row
          : {
              ...row,
              artifact: null,
              message: null,
              outputSupported: false,
              progress: null,
              progressPhase: null,
              status: row.status === "unsupported" ? row.status : "ready",
            },
      ),
    );
    return true;
  }, [updateRows]);

  const changeFormat = useCallback(
    (value: string) => {
      const defaultDescriptor = getDefaultAudioTranscodePreset(
        value,
        capabilities,
      );
      if (defaultDescriptor !== null && resetOutputsForTargetChange()) {
        setSettingsNotice(null);
        setFormat(value);
        setSelectedPresetId(defaultDescriptor.preset.id);
      }
    },
    [capabilities, resetOutputsForTargetChange],
  );
  const changeEncoding = useCallback(
    (parameterId: string, value: string) => {
      const next = selectAudioTranscodeEncodingPreset(
        format,
        selectedPresetId,
        parameterId as AudioStreamOutputParameterId,
        value,
        capabilities,
      );
      if (next !== null && resetOutputsForTargetChange()) {
        setSettingsNotice(null);
        setSelectedPresetId(next.preset.id);
      }
    },
    [capabilities, format, resetOutputsForTargetChange, selectedPresetId],
  );
  const changeSampleRate = useCallback(
    (value: string) => {
      if (resetOutputsForTargetChange()) {
        setSettingsNotice(null);
        setSampleRate(value);
      }
    },
    [resetOutputsForTargetChange],
  );
  const runConversions = useCallback(
    async (requestedIds: readonly string[]) => {
      if (descriptor === null) {
        return;
      }
      await runAudioConversionQueue({
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
        messages: {
          cancelled: t("cancelledMessage"),
          batchResult: (metrics) =>
            t("statusBatchResult", {
              attempted: metrics.attempted,
              eligible: metrics.eligible,
              failed: metrics.failed,
              succeeded: metrics.succeeded,
              unavailable: metrics.unavailable,
            }),
          converting: (metrics) =>
            metrics.unavailable > 0
              ? t("statusConvertingAvailability", {
                  converting: metrics.eligible,
                  unavailable: metrics.unavailable,
                })
              : t("statusConverting"),
          queued: (metrics) =>
            metrics.unavailable > 0
              ? t("statusQueuedAvailability", {
                  converting: metrics.eligible,
                  unavailable: metrics.unavailable,
                })
              : t("statusQueued"),
          conversionFailure: (error) =>
            formatConversionFailureMessage(error, t),
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
      });
    },
    [
      capabilities,
      descriptor,
      format,
      getRuntime,
      sampleRate,
      selectedPresetId,
      t,
      updateRows,
    ],
  );

  const cancelAll = useCallback(() => {
    const run = conversionRunRef.current;
    if (run === null) {
      return;
    }
    run.cancelled = true;
    run.active?.controller.abort();
    updateRows((current) =>
      current.map((row) =>
        row.status === "queued"
          ? {
              ...row,
              message: t("cancelledMessage"),
              progress: null,
              progressPhase: null,
              status: "ready",
            }
          : row,
      ),
    );
    setStatusMessage(t("cancelledMessage"));
  }, [t, updateRows]);

  const cancelRow = useCallback(
    (id: string) => {
      const inspectionController = inspectionControllersRef.current.get(id);
      if (inspectionController) {
        inspectionController.abort();
        updateRows((current) =>
          current.map((row) =>
            row.id === id
              ? { ...row, message: t("cancelledMessage"), status: "error" }
              : row,
          ),
        );
        return;
      }
      const run = conversionRunRef.current;
      if (run === null) {
        return;
      }
      run.cancelledIds.add(id);
      if (run.active?.id === id) {
        run.active.controller.abort();
      }
      updateRows((current) =>
        current.map((row) =>
          row.id === id && row.status === "queued"
            ? {
                ...row,
                message: t("cancelledMessage"),
                progress: null,
                progressPhase: null,
                status: "ready",
              }
            : row,
        ),
      );
    },
    [t, updateRows],
  );

  const retryRow = useCallback(
    (id: string) => {
      const row = rowsRef.current.find((candidate) => candidate.id === id);
      if (!row) {
        return;
      }
      if (row.inspection === null) {
        void inspectRow(id, row.source);
      } else if (row.outputSupported) {
        void runConversions([id]);
      } else {
        updateRows((current) =>
          current.map((candidate) =>
            candidate.id === id
              ? { ...candidate, message: null, status: "ready" }
              : candidate,
          ),
        );
        reprobeTarget();
      }
    },
    [inspectRow, reprobeTarget, runConversions, updateRows],
  );

  const removeRow = useCallback(
    (id: string) => {
      inspectionControllersRef.current.get(id)?.abort();
      inspectionControllersRef.current.delete(id);
      const row = rowsRef.current.find((candidate) => candidate.id === id);
      void row?.artifact?.dispose().catch(() => undefined);
      updateRows((current) =>
        current.filter((candidate) => candidate.id !== id),
      );
      if (externalSourceIdRef.current === id) {
        externalSourceIdRef.current = null;
        onExternalSourceRemove?.(id);
      }
      setCapacityError(null);
    },
    [onExternalSourceRemove, updateRows],
  );

  const clearRows = useCallback(() => {
    for (const controller of inspectionControllersRef.current.values()) {
      controller.abort();
    }
    inspectionControllersRef.current.clear();
    for (const row of rowsRef.current) {
      void row.artifact?.dispose().catch(() => undefined);
    }
    updateRows(() => []);
    if (externalSourceIdRef.current !== null) {
      onExternalSourceRemove?.(externalSourceIdRef.current);
      externalSourceIdRef.current = null;
    }
    setCapacityError(null);
    setStatusMessage(null);
    setSettingsNotice(null);
  }, [onExternalSourceRemove, updateRows]);

  const busy = rows.some(
    (row) => row.status === "queued" || row.status === "converting",
  );
  const downloadSource = useCallback(
    async (id: string) => {
      const row = rowsRef.current.find((candidate) => candidate.id === id);
      if (
        !row?.source.downloadUrl ||
        (row.status !== "ready" && row.status !== "complete")
      ) {
        return;
      }
      sourceDownloadRef.current?.abort();
      const controller = new AbortController();
      sourceDownloadRef.current = controller;
      setCapacityError(null);
      try {
        const result = await downloadOriginalAudio(
          row.source.downloadUrl,
          row.source.name,
          controller.signal,
        );
        if (result !== "started") {
          setCapacityError(
            t(
              result === "expired"
                ? "sourceDownloadExpired"
                : "sourceDownloadFailed",
            ),
          );
        }
      } catch {
        if (!controller.signal.aborted) {
          setCapacityError(t("sourceDownloadFailed"));
        }
      } finally {
        if (sourceDownloadRef.current === controller) {
          sourceDownloadRef.current = null;
        }
      }
    },
    [t],
  );
  const canConvertAll =
    !busy &&
    targetStatus !== "idle" &&
    targetStatus !== "checking" &&
    rows.some((row) => row.status === "ready" && row.outputSupported);
  const labels = useMemo<AudioTranscodeToolLabels>(
    () => ({
      title: t("title"),
      description: t("metadataDescription"),
      notices: t("notices"),
      targetIdle: t("targetIdle"),
      targetChecking: t("targetChecking"),
      targetReady: t("targetReady"),
      targetError: t("targetError"),
      dropTitle: t("dropTitle"),
      dropDescription: t("dropDescription"),
      chooseFiles: t("chooseFiles"),
      supportedFormatsLabel: t("supportedFormatsLabel"),
      supportedFormats: t("supportedFormats"),
      filesSelected: t("filesSelected"),
      outputSettings: t("outputSettings"),
      outputSettingsHelper: t("outputSettingsHelper"),
      processingDetails: t("processingDetails"),
      processingDetailsDescription: t("processingDetailsDescription"),
      format: t("format"),
      sampleRate: t("sampleRate"),
      queue: t("queue"),
      convert: t("convert"),
      cancelAll: t("cancelAll"),
      clear: t("clear"),
      download: t("download"),
      downloadSource: t("downloadSource"),
      retry: t("retry"),
      cancel: t("cancel"),
      remove: t("remove"),
    }),
    [t],
  );
  const fileViews = useMemo(
    () => rows.map((row) => projectAudioTranscodeFile(row, t)),
    [rows, t],
  );
  const assetIsLoading =
    assetState?.phase === "downloading" || assetState?.phase === "verifying";
  const assetHasFailed = assetState?.phase === "error";
  const visibleTargetStatus: AudioTranscodeTargetStatus = assetIsLoading
    ? "checking"
    : assetHasFailed
      ? "error"
      : targetStatus;
  const visibleTargetMessage = assetIsLoading
    ? t(
        assetState.phase === "downloading"
          ? "engineLoading"
          : "engineVerifying",
        {
          asset: assetState.assetName,
        },
      )
    : assetHasFailed
      ? t("engineLoadFailed", { asset: assetState.assetName })
      : targetMessage;
  const engineLoadingProgress = assetIsLoading
    ? assetState.totalBytes === null || assetState.totalBytes <= 0
      ? null
      : Math.min(100, (assetState.loadedBytes / assetState.totalBytes) * 100)
    : undefined;

  return (
    <AudioTranscodeToolView
      labels={labels}
      title={title === undefined ? labels.title : title}
      files={fileViews}
      accept={accept}
      maxFiles={AUDIO_TRANSCODER_FILE_CAPACITY}
      noticesHref={`https://github.com/echovisionlab/audio-transcoder/blob/v${AUDIO_TRANSCODER_CODEC_ASSET_MANIFEST.version}/THIRD_PARTY_NOTICES.md`}
      format={format}
      formatOptions={formatOptions}
      sampleRate={sampleRate}
      sampleRateOptions={sampleRateOptions}
      encodingControls={encodingControls}
      engineLoadingProgress={engineLoadingProgress}
      targetStatus={visibleTargetStatus}
      targetMessage={visibleTargetMessage}
      capacityError={capacityError}
      statusMessage={statusMessage}
      settingsNotice={settingsNotice}
      canAddFiles={externalSource === undefined && !busy}
      canConvertAll={canConvertAll}
      canCancelAll={busy}
      canClear={rows.length > 0 && !busy}
      isConverting={busy}
      showFilePicker={externalSource === undefined}
      onFilesSelected={handleFilesSelected}
      onFormatChange={changeFormat}
      onSampleRateChange={changeSampleRate}
      onEncodingChange={changeEncoding}
      onConvertAll={() =>
        void runConversions(
          rowsRef.current
            .filter((row) => row.status === "ready" && row.outputSupported)
            .map((row) => row.id),
        )
      }
      onCancelAll={cancelAll}
      onClear={clearRows}
      onRetry={retryRow}
      onCancel={cancelRow}
      onRemove={removeRow}
      onDownloadSource={downloadSource}
    />
  );
}
