import { describe, expect, it, vi } from "vitest";
import {
  AUDIO_TRANSCODER_CODEC_ASSET_MANIFEST,
  AUDIO_TRANSCODER_STREAM_CAPABILITIES,
  AudioTranscoderError,
  type AudioStreamInputSupportResult,
  type AudioStreamOperationOptions,
  type AudioStreamOutputProbeTarget,
  type AudioStreamProgress,
  type AudioStreamTarget,
  type AudioStreamTranscodeResult,
  type AudioTranscoderOutputArtifact,
  type AudioTranscoderOutputSession,
  type AudioTranscoderOutputStorage,
  type AudioTranscoderPendingOutput,
  type AudioTranscoderStreamWorkerEngine,
  type AudioTranscoderStreamWorkerPool,
  type CreateAudioTranscoderOutputSessionOptions,
  type CreateAudioTranscoderStreamWorkerPoolOptions,
} from "@echovisionlab/audio-transcoder";
import {
  AUDIO_TRANSCODER_FILE_CAPACITY,
  AUDIO_TRANSCODER_OUTPUT_MEMORY_BYTES,
  AUDIO_TRANSCODER_OUTPUT_NAMESPACE,
  AUDIO_TRANSCODER_POOL_CONCURRENCY,
  AUDIO_TRANSCODER_POOL_MAX_QUEUED,
  AUDIO_TRANSCODER_PROBE_DEADLINE_MS,
  createAudioTranscoderRuntime,
  type AudioTranscoderPageHideTarget,
  type AudioTranscoderRuntimeDependencies,
} from "./audio-transcoder-runtime";

const INPUT_BLOB = new Blob([new Uint8Array([1, 2, 3])], {
  type: "audio/x-caf",
});
const INPUT = {
  input: { blob: INPUT_BLOB, name: "field-recording.caf" },
  name: "field-recording.caf",
  size: INPUT_BLOB.size,
};

const TARGET = {
  presetId: "wav-pcm24",
} satisfies AudioStreamTarget;

const PROBE_TARGET = {
  channels: 2,
  presetId: "wav-pcm24",
  sampleRate: 48_000,
} satisfies AudioStreamOutputProbeTarget;

const INPUT_SUPPORT = {
  status: "supported",
  inspection: {
    bitDepth: 32,
    channels: 2,
    codec: "lpcm",
    container: "CAF",
    decodeSupport: "built-in",
    durationSeconds: 1,
    notes: [],
    sampleRate: 48_000,
    size: INPUT_BLOB.size,
  },
} satisfies AudioStreamInputSupportResult;

const TRANSCODE_RESULT = {
  bytesWritten: 3,
  channels: 2,
  details: { format: "wav", rf64: false },
  durationSeconds: 1,
  format: "wav",
  preset: {
    bitDepth: 24,
    container: "wav",
    extension: "wav",
    id: "wav-pcm24",
    mimeType: "audio/wav",
    sampleFormat: "integer",
  },
  rf64: false,
  sampleRate: 48_000,
} satisfies AudioStreamTranscodeResult;

describe("createAudioTranscoderRuntime", () => {
  it("stays lazy, exposes the package manifest, and creates capacity for ten files", async () => {
    const harness = createHarness();
    const runtime = createAudioTranscoderRuntime({
      dependencies: harness.dependencies,
      pageHideTarget: null,
    });

    expect(runtime.getCapabilities()).toBe(
      AUDIO_TRANSCODER_STREAM_CAPABILITIES,
    );
    expect(harness.createPool).not.toHaveBeenCalled();
    expect(harness.createOutputSession).not.toHaveBeenCalled();
    expect(AUDIO_TRANSCODER_FILE_CAPACITY).toBe(10);
    expect(AUDIO_TRANSCODER_POOL_CONCURRENCY).toBe(1);
    expect(AUDIO_TRANSCODER_POOL_MAX_QUEUED).toBe(9);
    expect(AUDIO_TRANSCODER_PROBE_DEADLINE_MS).toBe(15_000);

    await expect(runtime.probeInput(INPUT)).resolves.toBe(INPUT_SUPPORT);

    expect(harness.createPool).toHaveBeenCalledWith({
      codecAssets: {
        source: {
          basePath: "codec-assets",
          kind: "jsdelivr-github",
          repository: "echovisionlab/audio-transcoder",
          tag: `v${AUDIO_TRANSCODER_CODEC_ASSET_MANIFEST.version}`,
        },
      },
      concurrency: 1,
      maxQueued: 9,
      workerFactory: expect.any(Function),
    });
    expect(harness.createOutputSession).toHaveBeenCalledWith({
      disposeOnPageHide: false,
      memoryLimitBytes: AUDIO_TRANSCODER_OUTPUT_MEMORY_BYTES,
      namespace: AUDIO_TRANSCODER_OUTPUT_NAMESPACE,
    });
  });

  it("forwards a host-selected asset source and loading observer to the Worker pool", async () => {
    const harness = createHarness();
    const onAssetStateChange = vi.fn();
    const runtime = createAudioTranscoderRuntime({
      codecAssetSource: {
        baseUrl: "/storybook/audio-transcoder-codecs",
        kind: "self-hosted",
      },
      dependencies: harness.dependencies,
      onAssetStateChange,
      pageHideTarget: null,
    });

    await runtime.probeInput(INPUT);

    expect(harness.createPool).toHaveBeenCalledWith(
      expect.objectContaining({
        codecAssets: {
          onStateChange: onAssetStateChange,
          source: {
            baseUrl: "/storybook/audio-transcoder-codecs",
            kind: "self-hosted",
          },
        },
      }),
    );
  });

  it("does not probe any output until a caller supplies one exact target", async () => {
    const harness = createHarness();
    const runtime = createAudioTranscoderRuntime({
      dependencies: harness.dependencies,
      pageHideTarget: null,
    });

    const inputController = new AbortController();
    await runtime.probeInput(INPUT, { signal: inputController.signal });
    expect(harness.probeOutputSupport).not.toHaveBeenCalled();

    const outputController = new AbortController();
    await runtime.probeOutput(PROBE_TARGET, {
      signal: outputController.signal,
    });

    expect(harness.probeInputSupport).toHaveBeenCalledWith(INPUT.input, {
      signal: expect.any(AbortSignal),
    });
    expect(harness.probeOutputSupport).toHaveBeenCalledTimes(1);
    expect(harness.probeOutputSupport).toHaveBeenCalledWith(PROBE_TARGET, {
      signal: expect.any(AbortSignal),
    });
  });

  it("aborts a stalled browser codec probe at the application deadline", async () => {
    const harness = createHarness();
    let observedSignal: AbortSignal | undefined;
    const blockingEngine = {
      ...harness.engine,
      probeInputSupport: vi.fn(
        (_input: unknown, options?: { readonly signal?: AbortSignal }) =>
          new Promise<AudioStreamInputSupportResult>((_resolve, reject) => {
            observedSignal = options?.signal;
            options?.signal?.addEventListener(
              "abort",
              () => reject(new Error("probe deadline aborted")),
              {
                once: true,
              },
            );
          }),
      ),
    } as unknown as AudioTranscoderStreamWorkerEngine;
    const blockingPool = {
      ...harness.pool,
      schedule: <T>(
        operation: (engine: AudioTranscoderStreamWorkerEngine) => Promise<T>,
      ) => operation(blockingEngine),
    } as unknown as AudioTranscoderStreamWorkerPool;
    const runtime = createAudioTranscoderRuntime({
      dependencies: {
        ...harness.dependencies,
        createPool: () => blockingPool,
      },
      pageHideTarget: null,
      probeDeadlineMs: 20,
    });

    await expect(runtime.probeInput(INPUT)).rejects.toThrow(
      "probe deadline aborted",
    );
    expect(observedSignal?.aborted).toBe(true);
    expect(observedSignal?.reason).toBeInstanceOf(DOMException);
  });

  it("keeps multiple queued input probes READY by starting deadlines after admission", async () => {
    const harness = createHarness();
    let queue = Promise.resolve();
    const legacyProbeInputSupport = vi.fn(
      (_input: unknown, options?: { readonly signal?: AbortSignal }) =>
        new Promise<AudioStreamInputSupportResult>((resolve, reject) => {
          const timer = setTimeout(() => resolve(INPUT_SUPPORT), 30);
          options?.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(options.signal?.reason);
            },
            { once: true },
          );
        }),
    );
    const queuedPool = {
      ...harness.pool,
      probeInputSupport: legacyProbeInputSupport,
      schedule: <T>(
        operation: (engine: AudioTranscoderStreamWorkerEngine) => Promise<T>,
      ) => {
        const admitted = queue.then(async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return operation(harness.engine);
        });
        queue = admitted.then(
          () => undefined,
          () => undefined,
        );
        return admitted;
      },
    } as unknown as AudioTranscoderStreamWorkerPool;
    const runtime = createAudioTranscoderRuntime({
      dependencies: {
        ...harness.dependencies,
        createPool: () => queuedPool,
      },
      pageHideTarget: null,
      probeDeadlineMs: 20,
    });

    await expect(
      Promise.all([
        runtime.probeInput(INPUT),
        runtime.probeInput(INPUT),
        runtime.probeInput(INPUT),
      ]),
    ).resolves.toEqual([INPUT_SUPPORT, INPUT_SUPPORT, INPUT_SUPPORT]);
    expect(harness.probeInputSupport).toHaveBeenCalledTimes(3);
    expect(legacyProbeInputSupport).not.toHaveBeenCalled();
  });

  it("retries an inconclusive input probe once at the documented maximum read budget", async () => {
    const harness = createHarness();
    harness.probeInputSupport.mockRejectedValueOnce(
      new AudioTranscoderError(
        "RESOURCE_LIMIT_EXCEEDED",
        "The default probe budget was exhausted.",
      ),
    );
    const runtime = createAudioTranscoderRuntime({
      dependencies: harness.dependencies,
      pageHideTarget: null,
    });

    await expect(runtime.probeInput(INPUT)).resolves.toBe(INPUT_SUPPORT);

    expect(harness.probeInputSupport).toHaveBeenCalledTimes(2);
    expect(harness.probeInputSupport).toHaveBeenNthCalledWith(2, INPUT.input, {
      inputReadBytes:
        AUDIO_TRANSCODER_STREAM_CAPABILITIES.limits.buffers.maximumBytes,
      signal: expect.any(AbortSignal),
    });
  });

  it("creates the OPFS destination inside the admitted slot and preserves progress and cancellation", async () => {
    const harness = createHarness();
    const runtime = createAudioTranscoderRuntime({
      dependencies: harness.dependencies,
      pageHideTarget: null,
    });
    const controller = new AbortController();
    const progress = vi.fn<(value: AudioStreamProgress) => void>();

    const artifact = await runtime.transcode({
      source: INPUT,
      onProgress: progress,
      signal: controller.signal,
      target: TARGET,
    });

    expect(harness.createPendingOutput).toHaveBeenCalledTimes(1);
    expect(harness.createPendingOutput).toHaveBeenCalledWith();
    expect(harness.createWasInsideSchedule).toBe(true);
    expect(harness.transcodeOrder).toEqual(["session.create"]);
    expect(harness.scheduleOptions).toEqual({ signal: controller.signal });
    expect(harness.engineTranscode).toHaveBeenCalledWith(
      INPUT.input,
      TARGET,
      harness.pendingOutput.stream,
      {
        onProgress: progress,
        signal: controller.signal,
      },
    );
    expect(harness.engineTranscode.mock.calls[0]?.[3]).not.toHaveProperty(
      "maxOutputBytes",
    );
    expect(progress).toHaveBeenCalledWith(harness.progressEvent);
    expect(harness.complete).toHaveBeenCalledWith({
      mimeType: "audio/wav",
      name: "field-recording-converted.wav",
    });
    expect(artifact).toMatchObject({
      mimeType: "audio/wav",
      name: "field-recording-converted.wav",
      result: TRANSCODE_RESULT,
      size: 3,
      storage: "opfs",
      url: "blob:audio-output",
    });

    await Promise.all([artifact.dispose(), artifact.dispose()]);
    await artifact.dispose();

    expect(harness.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(harness.revokeObjectURL).toHaveBeenCalledWith("blob:audio-output");
    expect(harness.disposePackageArtifact).toHaveBeenCalledTimes(1);
  });

  it("uses the created memory destination capacity after an OPFS-to-memory fallback", async () => {
    const maxOutputBytes = 48 * 1024 * 1024;
    const harness = createHarness({
      pendingMaxOutputBytes: maxOutputBytes,
      reportedStorageMode: "opfs",
      storage: "memory",
    });
    const runtime = createAudioTranscoderRuntime({
      dependencies: harness.dependencies,
      pageHideTarget: null,
    });
    const controller = new AbortController();
    const progress = vi.fn<(value: AudioStreamProgress) => void>();

    await expect(runtime.getStorageMode()).resolves.toBe("opfs");
    await runtime.transcode({
      source: INPUT,
      onProgress: progress,
      signal: controller.signal,
      target: TARGET,
    });

    expect(harness.createPendingOutput).toHaveBeenCalledWith();
    expect(harness.transcodeOrder).toEqual(["session.create"]);
    expect(harness.engineTranscode).toHaveBeenCalledWith(
      INPUT.input,
      TARGET,
      harness.pendingOutput.stream,
      {
        maxOutputBytes,
        onProgress: progress,
        signal: controller.signal,
      },
    );
  });

  it("discards partial output and preserves a max-output preflight failure", async () => {
    const maxOutputBytes = 48 * 1024 * 1024;
    const preflightError = new AudioTranscoderError(
      "RESOURCE_LIMIT_EXCEEDED",
      "Predicted uncompressed audio payload exceeds maxOutputBytes.",
    );
    const harness = createHarness({
      pendingMaxOutputBytes: maxOutputBytes,
      storage: "memory",
      transcodeError: preflightError,
    });
    const runtime = createAudioTranscoderRuntime({
      dependencies: harness.dependencies,
      pageHideTarget: null,
    });

    await expect(
      runtime.transcode({ source: INPUT, target: TARGET }),
    ).rejects.toBe(preflightError);
    expect(harness.engineTranscode).toHaveBeenCalledWith(
      INPUT.input,
      TARGET,
      harness.pendingOutput.stream,
      {
        maxOutputBytes,
      },
    );
    expect(harness.discard).toHaveBeenCalledTimes(1);
    expect(harness.complete).not.toHaveBeenCalled();
    expect(harness.createObjectURL).not.toHaveBeenCalled();
  });

  it("falls back to a complete local diagnostic when the cleanup observer throws", async () => {
    const conversionError = new AudioTranscoderError(
      "WORKER_FAILURE",
      "The encoder failed.",
    );
    const cleanupError = new Error("Partial output cleanup failed.");
    const onOutputCleanupError = vi.fn(() => {
      throw new Error("Observer failed.");
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const harness = createHarness({
      discardError: cleanupError,
      discardFailures: 1,
      retryDiscardOnSessionDispose: true,
      transcodeError: conversionError,
    });
    const runtime = createAudioTranscoderRuntime({
      dependencies: harness.dependencies,
      onOutputCleanupError,
      pageHideTarget: null,
    });

    try {
      await expect(
        runtime.transcode({ source: INPUT, target: TARGET }),
      ).rejects.toBe(conversionError);
      expect(onOutputCleanupError).toHaveBeenCalledWith(cleanupError);
      expect(consoleError).toHaveBeenCalledWith(
        "Audio transcoder partial-output cleanup failed; the session will retry cleanup.",
        {
          code: null,
          error: cleanupError,
          message: "Partial output cleanup failed.",
          name: "Error",
          reason: null,
        },
      );
      expect(harness.discard).toHaveBeenCalledTimes(1);

      await expect(runtime.dispose()).resolves.toBeUndefined();
      expect(harness.discard).toHaveBeenCalledTimes(2);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("keeps the conversion error primary when the default cleanup logger throws", async () => {
    const conversionError = new AudioTranscoderError(
      "WORKER_FAILURE",
      "The encoder failed.",
    );
    const cleanupError = new DOMException(
      "OPFS cleanup failed.",
      "QuotaExceededError",
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("Wrapped console failed.");
    });
    const harness = createHarness({
      discardError: cleanupError,
      discardFailures: 1,
      transcodeError: conversionError,
    });
    const runtime = createAudioTranscoderRuntime({
      dependencies: harness.dependencies,
      pageHideTarget: null,
    });

    try {
      await expect(
        runtime.transcode({ source: INPUT, target: TARGET }),
      ).rejects.toBe(conversionError);
      expect(consoleError).toHaveBeenCalledWith(
        "Audio transcoder partial-output cleanup failed; the session will retry cleanup.",
        {
          code: null,
          error: cleanupError,
          message: "OPFS cleanup failed.",
          name: "QuotaExceededError",
          reason: null,
        },
      );
      await expect(runtime.dispose()).resolves.toBeUndefined();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("allows artifact cleanup to retry without revoking the URL twice", async () => {
    const harness = createHarness({ packageDisposeFailures: 1 });
    const runtime = createAudioTranscoderRuntime({
      dependencies: harness.dependencies,
      pageHideTarget: null,
    });
    const artifact = await runtime.transcode({ source: INPUT, target: TARGET });

    await expect(artifact.dispose()).rejects.toThrow("output cleanup failed");
    await expect(artifact.dispose()).resolves.toBeUndefined();

    expect(harness.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(harness.disposePackageArtifact).toHaveBeenCalledTimes(2);
  });

  it("uses pool-before-artifact-before-session disposal and ignores BFCache pagehide", async () => {
    const order: string[] = [];
    const pageHideTarget = new FakePageHideTarget();
    const harness = createHarness({ order });
    const runtime = createAudioTranscoderRuntime({
      dependencies: harness.dependencies,
      pageHideTarget,
    });
    await runtime.transcode({ source: INPUT, target: TARGET });

    pageHideTarget.dispatch(true);
    await Promise.resolve();
    expect(harness.disposePool).not.toHaveBeenCalled();

    pageHideTarget.dispatch(false);
    await vi.waitFor(() =>
      expect(harness.disposeOutputSession).toHaveBeenCalled(),
    );

    expect(order).toEqual([
      "pool.dispose",
      "url.revoke",
      "artifact.dispose",
      "session.dispose",
    ]);
    expect(pageHideTarget.listenerCount).toBe(0);
    await expect(runtime.dispose()).resolves.toBeUndefined();
    expect(harness.disposePool).toHaveBeenCalledTimes(1);
  });

  it("reports pagehide cleanup failures locally and preserves the original error when the logger throws", async () => {
    const pageHideError = new DOMException(
      "The OPFS session could not be removed.",
      "InvalidStateError",
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("Wrapped console failed.");
    });
    const pageHideTarget = new FakePageHideTarget();
    const harness = createHarness({ poolDisposeError: pageHideError });
    const runtime = createAudioTranscoderRuntime({
      dependencies: harness.dependencies,
      pageHideTarget,
    });
    await runtime.probeInput(INPUT);

    try {
      expect(() => pageHideTarget.dispatch(false)).not.toThrow();
      await vi.waitFor(() =>
        expect(consoleError).toHaveBeenCalledWith(
          "Audio transcoder pagehide cleanup failed.",
          {
            code: null,
            error: pageHideError,
            message: "The OPFS session could not be removed.",
            name: "InvalidStateError",
            reason: null,
          },
        ),
      );
      await expect(runtime.dispose()).rejects.toBe(pageHideError);
      expect(pageHideTarget.listenerCount).toBe(0);
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("runtime-owned Worker bootstrap cleanup", () => {
  it.each([false, true])(
    "releases pending cross-origin bootstraps after pool disposal (pool fails: %s)",
    async (fails) => {
      const poolFailure = new Error("Pool disposal failed");
      const harness = createHarness(
        fails ? { poolDisposeError: poolFailure } : {},
      );
      const terminate = vi.fn();
      vi.stubGlobal("window", { location: { origin: "https://www.dsub.io" } });
      vi.stubGlobal(
        "Worker",
        class extends EventTarget {
          terminate = terminate;
        },
      );
      try {
        const runtime = createAudioTranscoderRuntime({
          dependencies: harness.dependencies,
          pageHideTarget: null,
        });
        runtime.getQueueSnapshot();
        const worker = harness.createPool.mock.calls[0][0].workerFactory!(0);
        worker.terminate();
        expect(harness.revokeObjectURL).not.toHaveBeenCalled();
        if (fails) await expect(runtime.dispose()).rejects.toBe(poolFailure);
        else await expect(runtime.dispose()).resolves.toBeUndefined();
        expect(harness.disposePool).toHaveBeenCalledOnce();
        expect(harness.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
          "blob:audio-output",
        );
        expect(harness.disposeOutputSession).toHaveBeenCalledOnce();
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
});

interface HarnessOptions {
  readonly discardError?: Error;
  readonly discardFailures?: number;
  readonly order?: string[];
  readonly packageDisposeFailures?: number;
  readonly pendingMaxOutputBytes?: number;
  readonly poolDisposeError?: Error;
  readonly reportedStorageMode?: AudioTranscoderOutputStorage;
  readonly retryDiscardOnSessionDispose?: boolean;
  readonly storage?: AudioTranscoderOutputStorage;
  readonly transcodeError?: Error;
}

function createHarness(options: HarnessOptions = {}) {
  const order = options.order ?? [];
  const storage = options.storage ?? "opfs";
  const pendingMaxOutputBytes =
    options.pendingMaxOutputBytes ??
    (storage === "memory"
      ? AUDIO_TRANSCODER_OUTPUT_MEMORY_BYTES / 2
      : undefined);
  const transcodeOrder: string[] = [];
  let remainingDiscardFailures = options.discardFailures ?? 0;
  let remainingPackageDisposeFailures = options.packageDisposeFailures ?? 0;
  let insideSchedule = false;
  let createWasInsideSchedule = false;
  let scheduleOptions: { readonly signal?: AbortSignal } | undefined;

  const progressEvent = {
    durationSeconds: 1,
    phase: "encode",
    processedSeconds: 0.5,
    progress: 0.5,
  } satisfies AudioStreamProgress;
  const outputProbeResult = {
    code: "SUPPORTED",
    message: "The output runtime probe succeeded.",
    reason: "runtime-verified",
    status: "supported",
  } as const;
  const outputStream = new WritableStream();
  const disposePackageArtifact = vi.fn(async () => {
    order.push("artifact.dispose");
    if (remainingPackageDisposeFailures > 0) {
      remainingPackageDisposeFailures -= 1;
      throw new Error("output cleanup failed");
    }
  });
  const packageArtifact = {
    blob: new Blob([new Uint8Array([4, 5, 6])], { type: "audio/wav" }),
    dispose: disposePackageArtifact,
    mimeType: "audio/wav",
    name: "field-recording-converted.wav",
    size: 3,
    storage,
  } satisfies AudioTranscoderOutputArtifact;
  const complete = vi.fn(async () => packageArtifact);
  const discard = vi.fn(async () => {
    if (remainingDiscardFailures > 0) {
      remainingDiscardFailures -= 1;
      throw options.discardError ?? new Error("Partial output cleanup failed.");
    }
  });
  const pendingOutput = {
    complete,
    discard,
    ...(pendingMaxOutputBytes === undefined
      ? {}
      : { maxOutputBytes: pendingMaxOutputBytes }),
    storage,
    stream: outputStream,
  } satisfies AudioTranscoderPendingOutput;
  const createPendingOutput = vi.fn(async () => {
    createWasInsideSchedule = insideSchedule;
    transcodeOrder.push("session.create");
    return pendingOutput;
  });
  const disposeOutputSession = vi.fn(async () => {
    order.push("session.dispose");
    if (options.retryDiscardOnSessionDispose === true) {
      await discard();
    }
  });
  const outputSession = {
    create: createPendingOutput,
    dispose: disposeOutputSession,
    getMemoryReservation: () => ({
      limitBytes: AUDIO_TRANSCODER_OUTPUT_MEMORY_BYTES,
      reservedBytes: 0,
    }),
    getStorageMode: async () => options.reportedStorageMode ?? storage,
  } satisfies AudioTranscoderOutputSession;
  const engineTranscode = vi.fn(
    async (
      _input: unknown,
      _target: unknown,
      _output: unknown,
      operationOptions?: AudioStreamOperationOptions,
    ) => {
      operationOptions?.onProgress?.(progressEvent);
      if (options.transcodeError !== undefined) {
        throw options.transcodeError;
      }
      return TRANSCODE_RESULT;
    },
  );
  const probeInputSupport = vi.fn(async () => INPUT_SUPPORT);
  const probeOutputSupport = vi.fn(async () => outputProbeResult);
  const engine = {
    probeInputSupport,
    probeOutputSupport,
    transcode: engineTranscode,
  } as unknown as AudioTranscoderStreamWorkerEngine;
  const disposePool = vi.fn(async () => {
    order.push("pool.dispose");
    if (options.poolDisposeError !== undefined) {
      throw options.poolDisposeError;
    }
  });
  const pool = {
    dispose: disposePool,
    getQueueSnapshot: () => ({
      active: 0,
      concurrency: 1,
      maxQueued: 9,
      queued: 0,
      terminated: false,
      workers: 0,
    }),
    probeInputSupport,
    probeOutputSupport,
    schedule: async <T>(
      operation: (worker: AudioTranscoderStreamWorkerEngine) => Promise<T>,
      operationOptions?: { readonly signal?: AbortSignal },
    ): Promise<T> => {
      scheduleOptions = operationOptions;
      insideSchedule = true;
      try {
        return await operation(engine);
      } finally {
        insideSchedule = false;
      }
    },
  } as unknown as AudioTranscoderStreamWorkerPool;
  const createPool = vi.fn(
    (_options: CreateAudioTranscoderStreamWorkerPoolOptions) => pool,
  );
  const createOutputSession = vi.fn(
    (_options: CreateAudioTranscoderOutputSessionOptions) => outputSession,
  );
  const createObjectURL = vi.fn(() => "blob:audio-output");
  const revokeObjectURL = vi.fn((url: string) => {
    order.push("url.revoke");
    expect(url).toBe("blob:audio-output");
  });
  const dependencies = {
    createOutputSession,
    createPool,
    objectUrl: { createObjectURL, revokeObjectURL },
  } satisfies AudioTranscoderRuntimeDependencies;

  return {
    complete,
    createObjectURL,
    createOutputSession,
    createPendingOutput,
    createPool,
    dependencies,
    discard,
    disposeOutputSession,
    disposePackageArtifact,
    disposePool,
    engine,
    engineTranscode,
    get createWasInsideSchedule() {
      return createWasInsideSchedule;
    },
    pendingOutput,
    pool,
    probeInputSupport,
    probeOutputSupport,
    progressEvent,
    revokeObjectURL,
    get scheduleOptions() {
      return scheduleOptions;
    },
    transcodeOrder,
  };
}

class FakePageHideTarget implements AudioTranscoderPageHideTarget {
  private readonly listeners = new Set<EventListener>();

  get listenerCount(): number {
    return this.listeners.size;
  }

  readonly addEventListener = (
    _type: "pagehide",
    listener: EventListener,
  ): void => {
    this.listeners.add(listener);
  };

  readonly removeEventListener = (
    _type: "pagehide",
    listener: EventListener,
  ): void => {
    this.listeners.delete(listener);
  };

  dispatch(persisted: boolean): void {
    const event = new Event("pagehide");
    Object.defineProperty(event, "persisted", { value: persisted });
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
