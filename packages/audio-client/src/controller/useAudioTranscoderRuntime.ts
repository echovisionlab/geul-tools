import { useCallback, useEffect, useRef, useState } from "react";
import type { RuntimeAssetLoadState } from "@echovisionlab/audio-transcoder";
import type {
  AudioTranscoderRuntime,
  CreateAudioTranscoderRuntimeOptions,
} from "../audio-transcoder-runtime";
import { reportRuntimeDisposeFailure } from "./audio-transcode-errors";
import type { ConversionRun } from "./audio-transcode-controller-model";

export type AudioTranscoderRuntimeFactory = (
  options?: Pick<CreateAudioTranscoderRuntimeOptions, "onAssetStateChange">,
) => AudioTranscoderRuntime;

export function useAudioTranscoderRuntime(
  runtimeFactory: AudioTranscoderRuntimeFactory,
) {
  const [assetState, setAssetState] = useState<RuntimeAssetLoadState | null>(
    null,
  );
  const runtimeRef = useRef<AudioTranscoderRuntime | null>(null);
  const inspectionControllersRef = useRef(new Map<string, AbortController>());
  const targetProbeControllerRef = useRef<AbortController | null>(null);
  const conversionRunRef = useRef<ConversionRun | null>(null);
  const disposedRef = useRef(false);

  const getRuntime = useCallback(() => {
    if (disposedRef.current) {
      throw new Error("Audio transcoder tool has been disposed.");
    }
    runtimeRef.current ??= runtimeFactory({
      onAssetStateChange: (state) => {
        if (!disposedRef.current) {
          setAssetState(state);
        }
      },
    });
    return runtimeRef.current;
  }, [runtimeFactory]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      inspectionControllersRef.current.forEach((controller) =>
        controller.abort(),
      );
      inspectionControllersRef.current.clear();
      targetProbeControllerRef.current?.abort();
      targetProbeControllerRef.current = null;
      const run = conversionRunRef.current;
      if (run) {
        run.cancelled = true;
        run.active?.controller.abort();
        conversionRunRef.current = null;
      }
      const runtime = runtimeRef.current;
      runtimeRef.current = null;
      void runtime?.dispose().catch(reportRuntimeDisposeFailure);
    };
  }, []);

  return {
    assetState,
    getRuntime,
    inspectionControllersRef,
    targetProbeControllerRef,
    conversionRunRef,
    disposedRef,
  };
}
