import type {
  AudioStreamInspection,
  AudioStreamProgressPhase,
} from "@echovisionlab/audio-transcoder";
import type {
  AudioTranscoderDownloadArtifact,
  AudioTranscoderInputSource,
} from "../audio-transcoder-runtime";
import type { AudioTranscodeFileStatus } from "../ui";

export interface AudioTranscodeRow {
  readonly id: string;
  readonly source: AudioTranscoderInputSource;
  readonly inspection: AudioStreamInspection | null;
  readonly artifact: AudioTranscoderDownloadArtifact | null;
  readonly status: AudioTranscodeFileStatus;
  readonly message: string | null;
  readonly outputSupported: boolean;
  readonly progress: number | null;
  readonly progressPhase: AudioStreamProgressPhase | null;
}

export interface ConversionRun {
  readonly cancelledIds: Set<string>;
  readonly token: symbol;
  active: { id: string; controller: AbortController } | null;
  cancelled: boolean;
}

export interface ConversionMetrics {
  attempted: number;
  eligible: number;
  failed: number;
  succeeded: number;
  unavailable: number;
}
