import {
  AUDIO_TRANSCODER_OUTPUT_MEMORY_LIMIT_BYTES,
  AUDIO_TRANSCODER_STREAM_CAPABILITIES,
  AudioTranscoderError,
  createAudioTranscoderJsDelivrAssetSource,
  createAudioTranscoderOutputSession,
  createAudioTranscoderStreamWorkerPool,
  type AudioStreamInputSupportResult,
  type AudioStreamInput,
  type AudioStreamOperationOptions,
  type AudioStreamOutputProbeOptions,
  type AudioStreamOutputProbeTarget,
  type AudioStreamOutputSupportResult,
  type AudioStreamProgress,
  type AudioStreamTarget,
  type AudioStreamTranscodeResult,
  type AudioTranscoderOutputArtifact,
  type AudioTranscoderOutputSession,
  type AudioTranscoderOutputStorage,
  type AudioTranscoderStreamCapabilities,
  type AudioTranscoderStreamQueueSnapshot,
  type AudioTranscoderStreamWorkerPool,
  type CreateAudioTranscoderOutputSessionOptions,
  type CreateAudioTranscoderStreamWorkerPoolOptions,
  type RuntimeAssetLoadState,
  type RuntimeAssetSource,
} from "@echovisionlab/audio-transcoder";
import workerAssetUrl from "./audio-transcoder.worker.ts?worker&url";
import { readErrorProperty } from "./error-diagnostics";

export const AUDIO_TRANSCODER_FILE_CAPACITY = 10;
export const AUDIO_TRANSCODER_POOL_CONCURRENCY = 1;
export const AUDIO_TRANSCODER_POOL_MAX_QUEUED =
  AUDIO_TRANSCODER_FILE_CAPACITY - AUDIO_TRANSCODER_POOL_CONCURRENCY;
export const AUDIO_TRANSCODER_OUTPUT_MEMORY_BYTES =
  AUDIO_TRANSCODER_OUTPUT_MEMORY_LIMIT_BYTES;
export const AUDIO_TRANSCODER_OUTPUT_NAMESPACE = "audio-tools-transcode";
export const AUDIO_TRANSCODER_PROBE_DEADLINE_MS = 15_000;

export interface AudioTranscoderInputSource {
  /** Consumer-owned endpoint for streaming the unmodified source. */
  readonly downloadUrl?: string;
  readonly input: AudioStreamInput;
  readonly name: string;
  readonly size: number;
}

export interface AudioTranscoderInputProbeOptions {
  readonly inputReadBytes?: number;
  readonly signal?: AbortSignal;
}

export interface AudioTranscoderConversionRequest {
  readonly downloadName?: string;
  readonly onProgress?: (progress: AudioStreamProgress) => void;
  readonly signal?: AbortSignal;
  readonly source: AudioTranscoderInputSource;
  readonly target: AudioStreamTarget;
}

export interface AudioTranscoderDownloadArtifact {
  readonly mimeType: string;
  readonly name: string;
  readonly result: AudioStreamTranscodeResult;
  readonly size: number;
  readonly storage: AudioTranscoderOutputStorage;
  readonly url: string;
  /** Revokes the object URL before releasing temporary output storage. */
  dispose: () => Promise<void>;
}

export interface AudioTranscoderRuntime {
  /** Immutable candidate manifest. This does not initialize a Worker. */
  getCapabilities: () => AudioTranscoderStreamCapabilities;
  getQueueSnapshot: () => AudioTranscoderStreamQueueSnapshot;
  getStorageMode: () => Promise<AudioTranscoderOutputStorage>;
  probeInput: (
    source: AudioTranscoderInputSource,
    options?: AudioTranscoderInputProbeOptions,
  ) => Promise<AudioStreamInputSupportResult>;
  /** Probes only the exact target supplied by the caller. */
  probeOutput: (
    target: AudioStreamOutputProbeTarget,
    options?: AudioStreamOutputProbeOptions,
  ) => Promise<AudioStreamOutputSupportResult>;
  transcode: (
    request: AudioTranscoderConversionRequest,
  ) => Promise<AudioTranscoderDownloadArtifact>;
  /** Terminal cleanup. The Worker pool always settles before output storage. */
  dispose: () => Promise<void>;
}

export interface AudioTranscoderPageHideTarget {
  addEventListener: (type: "pagehide", listener: EventListener) => void;
  removeEventListener: (type: "pagehide", listener: EventListener) => void;
}

interface AudioTranscoderObjectUrlApi {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
}

export interface AudioTranscoderRuntimeDependencies {
  createOutputSession: (
    options: CreateAudioTranscoderOutputSessionOptions,
  ) => AudioTranscoderOutputSession;
  createPool: (
    options: CreateAudioTranscoderStreamWorkerPoolOptions,
  ) => AudioTranscoderStreamWorkerPool;
  objectUrl: AudioTranscoderObjectUrlApi;
}

export interface CreateAudioTranscoderRuntimeOptions {
  /** Explicit source for lazy codec and resampler assets. Defaults to the exact package release on jsDelivr. */
  readonly codecAssetSource?: RuntimeAssetSource;
  /** Test seam. Production consumers should use the package defaults. */
  readonly dependencies?: Partial<AudioTranscoderRuntimeDependencies>;
  readonly memoryLimitBytes?: number;
  readonly namespace?: string;
  readonly onAssetStateChange?: (state: RuntimeAssetLoadState) => void;
  /** Browser-local observer for a failed partial-output cleanup. The session retains the resource for a later retry. */
  readonly onOutputCleanupError?: (error: unknown) => void;
  /** Browser-local observer for terminal cleanup failures triggered by pagehide. */
  readonly onPageHideError?: (error: unknown) => void;
  /** Application wall-clock deadline for each browser codec probe. */
  readonly probeDeadlineMs?: number;
  /** Defaults to the current Window when available. */
  readonly pageHideTarget?: AudioTranscoderPageHideTarget | null;
}

interface RuntimeResources {
  readonly outputSession: AudioTranscoderOutputSession;
  readonly pool: AudioTranscoderStreamWorkerPool;
}

interface TrackedDownloadArtifact extends AudioTranscoderDownloadArtifact {
  readonly packageArtifact: AudioTranscoderOutputArtifact;
}

const TERMINAL_RUNTIME_MESSAGE =
  "The audio transcoder runtime has been disposed.";

export function createAudioTranscoderRuntime(
  options: CreateAudioTranscoderRuntimeOptions = {},
): AudioTranscoderRuntime {
  const dependencies = resolveDependencies(options.dependencies);
  const workerUrl = new URL(workerAssetUrl, import.meta.url);
  const workers = createAudioTranscoderWorkerFactory(
    workerUrl,
    dependencies.objectUrl,
    typeof window === "undefined" ? workerUrl.origin : window.location.origin,
  );
  const pageHideTarget =
    options.pageHideTarget === undefined
      ? resolveWindow()
      : options.pageHideTarget;
  const artifacts = new Set<TrackedDownloadArtifact>();
  const probeDeadlineMs = resolveProbeDeadline(options.probeDeadlineMs);
  let resources: RuntimeResources | undefined;
  let disposal: Promise<void> | undefined;
  let disposed = false;

  const ensureResources = (): RuntimeResources => {
    if (disposed) {
      throw new AudioTranscoderError(
        "WORKER_TERMINATED",
        TERMINAL_RUNTIME_MESSAGE,
      );
    }
    resources ??= {
      outputSession: dependencies.createOutputSession({
        disposeOnPageHide: false,
        memoryLimitBytes:
          options.memoryLimitBytes ?? AUDIO_TRANSCODER_OUTPUT_MEMORY_BYTES,
        namespace: options.namespace ?? AUDIO_TRANSCODER_OUTPUT_NAMESPACE,
      }),
      pool: dependencies.createPool({
        codecAssets: {
          source:
            options.codecAssetSource ??
            createAudioTranscoderJsDelivrAssetSource(),
          ...(options.onAssetStateChange === undefined
            ? {}
            : { onStateChange: options.onAssetStateChange }),
        },
        concurrency: AUDIO_TRANSCODER_POOL_CONCURRENCY,
        maxQueued: AUDIO_TRANSCODER_POOL_MAX_QUEUED,
        workerFactory: workers.create,
      }),
    };
    return resources;
  };

  const dispose = (): Promise<void> => {
    if (disposal !== undefined) {
      return disposal;
    }

    disposed = true;
    pageHideTarget?.removeEventListener("pagehide", handlePageHide);
    const ownedResources = resources;
    disposal = (async () => {
      if (ownedResources === undefined) {
        workers.dispose();
        return;
      }

      const failures: unknown[] = [];
      try {
        await ownedResources.pool.dispose();
      } catch (error) {
        failures.push(error);
      } finally {
        workers.dispose();
      }

      const artifactSettlements = await Promise.allSettled(
        [...artifacts].map((artifact) => artifact.dispose()),
      );
      failures.push(
        ...artifactSettlements.flatMap((settlement) =>
          settlement.status === "rejected" ? [settlement.reason] : [],
        ),
      );

      try {
        await ownedResources.outputSession.dispose();
      } catch (error) {
        failures.push(error);
      }

      if (failures.length === 1) {
        throw failures[0];
      }
      if (failures.length > 1) {
        throw new AggregateError(
          failures,
          "Failed to dispose the audio transcoder runtime.",
        );
      }
    })();
    return disposal;
  };

  function handlePageHide(event: Event): void {
    if ("persisted" in event && event.persisted === true) {
      return;
    }
    void dispose().catch((error: unknown) => {
      notifyBrowserLocalError(
        "Audio transcoder pagehide cleanup failed.",
        error,
        options.onPageHideError,
      );
    });
  }

  pageHideTarget?.addEventListener("pagehide", handlePageHide);

  return {
    getCapabilities: () => AUDIO_TRANSCODER_STREAM_CAPABILITIES,
    getQueueSnapshot: () => ensureResources().pool.getQueueSnapshot(),
    getStorageMode: () => ensureResources().outputSession.getStorageMode(),
    probeInput(source, operationOptions = {}) {
      const pool = ensureResources().pool;
      const probe = (inputReadBytes: number | undefined) =>
        pool.schedule(
          (engine) =>
            withProbeDeadline(
              operationOptions.signal,
              probeDeadlineMs,
              (signal) =>
                engine.probeInputSupport(source.input, {
                  ...(inputReadBytes === undefined ? {} : { inputReadBytes }),
                  signal,
                }),
            ),
          { signal: operationOptions.signal },
        );
      return probe(operationOptions.inputReadBytes).catch((error: unknown) => {
        const maximumInputReadBytes =
          AUDIO_TRANSCODER_STREAM_CAPABILITIES.limits.buffers.maximumBytes;
        if (
          operationOptions.signal?.aborted ||
          !isResourceLimitError(error) ||
          operationOptions.inputReadBytes === maximumInputReadBytes
        ) {
          throw error;
        }
        return probe(maximumInputReadBytes);
      });
    },
    probeOutput(target, operationOptions = {}) {
      const pool = ensureResources().pool;
      return pool.schedule(
        (engine) =>
          withProbeDeadline(
            operationOptions.signal,
            probeDeadlineMs,
            (signal) => engine.probeOutputSupport(target, { signal }),
          ),
        { signal: operationOptions.signal },
      );
    },
    transcode(request) {
      const ownedResources = ensureResources();
      return ownedResources.pool.schedule(
        async (engine) => {
          const pending = await ownedResources.outputSession.create();
          try {
            const result = await engine.transcode(
              request.source.input,
              request.target,
              pending.stream,
              operationOptions(request, pending.maxOutputBytes),
            );
            const packageArtifact = await pending.complete({
              mimeType: result.preset.mimeType,
              name:
                request.downloadName ??
                replaceExtension(request.source.name, result.preset.extension),
            });
            const artifact = await createDownloadArtifact(
              packageArtifact,
              result,
              dependencies.objectUrl,
              () => artifacts.delete(artifact),
            );
            artifacts.add(artifact);
            return artifact;
          } catch (error) {
            try {
              await pending.discard();
            } catch (cleanupError) {
              notifyOutputCleanupError(
                cleanupError,
                options.onOutputCleanupError,
              );
            }
            throw error;
          }
        },
        { signal: request.signal },
      );
    },
    dispose,
  };
}

function operationOptions(
  request: AudioTranscoderConversionRequest,
  maxOutputBytes: number | undefined,
): AudioStreamOperationOptions {
  return {
    ...(maxOutputBytes === undefined ? {} : { maxOutputBytes }),
    ...(request.onProgress === undefined
      ? {}
      : { onProgress: request.onProgress }),
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  };
}

function notifyOutputCleanupError(
  error: unknown,
  observer: ((error: unknown) => void) | undefined,
): void {
  notifyBrowserLocalError(
    "Audio transcoder partial-output cleanup failed; the session will retry cleanup.",
    error,
    observer,
  );
}

function notifyBrowserLocalError(
  message: string,
  error: unknown,
  observer: ((error: unknown) => void) | undefined,
): void {
  if (observer !== undefined) {
    try {
      observer(error);
      return;
    } catch {
      // Fall through to the browser-local logger.
    }
  }

  try {
    // This diagnostic stays in the browser and adds no input filename or file content.
    console.error(message, {
      code: readErrorProperty(error, "code"),
      message: readErrorProperty(error, "message"),
      name: readErrorProperty(error, "name"),
      reason: readErrorProperty(error, "reason"),
      error,
    });
  } catch {
    // Diagnostics must never replace the original failure.
  }
}

async function createDownloadArtifact(
  packageArtifact: AudioTranscoderOutputArtifact,
  result: AudioStreamTranscodeResult,
  objectUrl: AudioTranscoderObjectUrlApi,
  onDisposed: () => void,
): Promise<TrackedDownloadArtifact> {
  let url: string;
  try {
    url = objectUrl.createObjectURL(packageArtifact.blob);
  } catch (error) {
    await packageArtifact.dispose().catch(() => undefined);
    throw error;
  }

  let cleanupInFlight: Promise<void> | undefined;
  let cleanupSucceeded: Promise<void> | undefined;
  let urlRevoked = false;
  const artifact: TrackedDownloadArtifact = {
    mimeType: packageArtifact.mimeType,
    name: packageArtifact.name,
    packageArtifact,
    result,
    size: packageArtifact.size,
    storage: packageArtifact.storage,
    url,
    dispose() {
      if (cleanupSucceeded !== undefined) {
        return cleanupSucceeded;
      }
      if (cleanupInFlight !== undefined) {
        return cleanupInFlight;
      }

      if (!urlRevoked) {
        objectUrl.revokeObjectURL(url);
        urlRevoked = true;
      }

      const attempt = Promise.resolve().then(() => packageArtifact.dispose());
      cleanupInFlight = attempt;
      void attempt.then(
        () => {
          cleanupSucceeded = attempt;
          cleanupInFlight = undefined;
          onDisposed();
        },
        () => {
          cleanupInFlight = undefined;
        },
      );
      return attempt;
    },
  };
  return artifact;
}

function replaceExtension(name: string, extension: string): string {
  const lastSlash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
  const lastDot = name.lastIndexOf(".");
  const stem = lastDot > lastSlash + 1 ? name.slice(0, lastDot) : name;
  return `${stem || "audio"}-converted.${extension}`;
}

function resolveDependencies(
  overrides: Partial<AudioTranscoderRuntimeDependencies> | undefined,
): AudioTranscoderRuntimeDependencies {
  return {
    createOutputSession:
      overrides?.createOutputSession ?? createAudioTranscoderOutputSession,
    createPool: overrides?.createPool ?? createAudioTranscoderStreamWorkerPool,
    objectUrl: overrides?.objectUrl ?? {
      createObjectURL(blob) {
        return URL.createObjectURL(blob);
      },
      revokeObjectURL(url) {
        URL.revokeObjectURL(url);
      },
    },
  };
}

function resolveWindow(): AudioTranscoderPageHideTarget | null {
  return typeof window === "undefined" ? null : window;
}

/** Owns only cross-origin module bootstrap URLs; the pool owns native Workers. */
export function createAudioTranscoderWorkerFactory(
  workerUrl: URL,
  objectUrl: AudioTranscoderObjectUrlApi,
  pageOrigin: string,
) {
  const pendingBootstraps = new Set<string>();
  const workerOptions: WorkerOptions = {
    name: "audio-transcoder",
    type: "module",
  };
  return {
    create(): Worker {
      if (workerUrl.origin === pageOrigin)
        return new Worker(workerUrl, workerOptions);
      const bootstrapUrl = objectUrl.createObjectURL(
        new Blob([`import ${JSON.stringify(workerUrl.href)};`], {
          type: "text/javascript",
        }),
      );
      pendingBootstraps.add(bootstrapUrl);
      let worker: Worker;
      const release = () => {
        if (pendingBootstraps.delete(bootstrapUrl))
          objectUrl.revokeObjectURL(bootstrapUrl);
        worker?.removeEventListener("message", release);
        worker?.removeEventListener("error", release);
        worker?.removeEventListener("messageerror", release);
      };
      try {
        worker = new Worker(bootstrapUrl, workerOptions);
        worker.addEventListener("message", release);
        worker.addEventListener("error", release);
        worker.addEventListener("messageerror", release);
        return worker;
      } catch (error) {
        release();
        throw error;
      }
    },
    dispose() {
      for (const url of pendingBootstraps) objectUrl.revokeObjectURL(url);
      pendingBootstraps.clear();
    },
  };
}

function resolveProbeDeadline(value: number | undefined): number {
  const deadline = value ?? AUDIO_TRANSCODER_PROBE_DEADLINE_MS;
  if (!Number.isFinite(deadline) || deadline <= 0) {
    throw new RangeError(
      "Audio transcoder probe deadline must be a positive finite number.",
    );
  }
  return deadline;
}

async function withProbeDeadline<T>(
  parentSignal: AbortSignal | undefined,
  deadlineMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) {
    forwardAbort();
  } else {
    parentSignal?.addEventListener("abort", forwardAbort, { once: true });
  }
  const timeout = setTimeout(
    () =>
      controller.abort(
        new DOMException(
          "Audio transcoder probe deadline exceeded.",
          "TimeoutError",
        ),
      ),
    deadlineMs,
  );

  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", forwardAbort);
  }
}

function isResourceLimitError(error: unknown): boolean {
  return (
    (error instanceof AudioTranscoderError &&
      error.code === "RESOURCE_LIMIT_EXCEEDED") ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "RESOURCE_LIMIT_EXCEEDED")
  );
}
