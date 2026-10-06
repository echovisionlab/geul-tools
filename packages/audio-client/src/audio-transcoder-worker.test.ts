import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAudioTranscoderWorkerFactory } from "./audio-transcoder-runtime";

class FakeWorker extends EventTarget {
  readonly terminate = vi.fn();
  constructor(
    readonly url: string | URL,
    readonly options?: WorkerOptions,
  ) {
    super();
  }
}
const createObjectURL = vi.fn(
  (_blob: Blob) => "blob:https://www.dsub.io/bootstrap",
);
const revokeObjectURL = vi.fn();
beforeEach(() => {
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function factory(origin: string) {
  return createAudioTranscoderWorkerFactory(
    new URL("https://transcode.dsub.io/embed/assets/audio-worker.js"),
    { createObjectURL, revokeObjectURL },
    origin,
  );
}

describe("audio module Worker bootstrap", () => {
  it("keeps direct native module Worker construction for same-origin assets", () => {
    const workers = factory("https://transcode.dsub.io");
    const worker = workers.create() as unknown as FakeWorker;
    expect(worker.url).toEqual(
      new URL("https://transcode.dsub.io/embed/assets/audio-worker.js"),
    );
    expect(worker.options).toEqual({
      name: "audio-transcoder",
      type: "module",
    });
    expect(createObjectURL).not.toHaveBeenCalled();
    workers.dispose();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
  it("imports the absolute remote asset through an owned Blob and releases it once the Worker responds", async () => {
    const workers = factory("https://www.dsub.io");
    const worker = workers.create() as unknown as FakeWorker;
    expect(worker.url).toBe("blob:https://www.dsub.io/bootstrap");
    expect(worker.options?.type).toBe("module");
    const bootstrap = createObjectURL.mock.calls[0][0] as Blob;
    expect(await bootstrap.text()).toBe(
      'import "https://transcode.dsub.io/embed/assets/audio-worker.js";',
    );
    worker.dispatchEvent(new Event("message"));
    worker.dispatchEvent(new Event("message"));
    workers.dispose();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(worker.url);
    expect(worker.terminate).not.toHaveBeenCalled();
  });
  it.each(["error", "messageerror"])("releases its bootstrap on %s", (type) => {
    const workers = factory("https://www.dsub.io");
    const worker = workers.create();
    worker.dispatchEvent(new Event(type));
    workers.dispose();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
      "blob:https://www.dsub.io/bootstrap",
    );
  });
  it("releases its bootstrap if native Worker construction fails", () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("Worker blocked");
        }
      },
    );
    const workers = factory("https://www.dsub.io");
    expect(() => workers.create()).toThrow("Worker blocked");
    workers.dispose();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });
  it("releases a terminated Worker's pending bootstrap during factory disposal", () => {
    const workers = factory("https://www.dsub.io");
    const worker = workers.create();
    worker.terminate();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    workers.dispose();
    workers.dispose();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });
});
