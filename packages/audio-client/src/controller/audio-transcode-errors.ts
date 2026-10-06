import { AudioTranscoderError } from "@echovisionlab/audio-transcoder";
import type { useTranslations } from "use-intl";
import { readErrorProperty } from "../error-diagnostics";

type TranscodeTranslate = ReturnType<typeof useTranslations<"tools.transcode">>;

interface ConversionErrorDetails {
  readonly code: string | null;
  readonly message: string | null;
  readonly name: string | null;
  readonly reason: string | null;
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof AudioTranscoderError &&
      error.code === "OPERATION_ABORTED") ||
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "OPERATION_ABORTED")
  );
}

export function isResourceLimitError(error: unknown): boolean {
  return (
    (error instanceof AudioTranscoderError &&
      error.code === "RESOURCE_LIMIT_EXCEEDED") ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "RESOURCE_LIMIT_EXCEEDED")
  );
}

export function formatConversionFailureMessage(
  error: unknown,
  translate: TranscodeTranslate,
): string {
  const details = readConversionErrorDetails(error);
  if (
    details.code === "RESOURCE_LIMIT_EXCEEDED" &&
    details.reason === "output-storage-limit"
  ) {
    return appendErrorIdentity(
      translate("conversionStorageLimitExceeded"),
      details,
    );
  }
  if (
    details.code === "UNSUPPORTED_OUTPUT" &&
    details.reason === "target-size-limit"
  ) {
    return appendErrorIdentity(
      translate("conversionTargetSizeLimitExceeded"),
      details,
    );
  }
  return appendErrorIdentity(
    details.message ??
      formatThrownValue(error) ??
      translate("conversionFailed"),
    details,
  );
}

export function reportConversionFailure(
  error: unknown,
  context: {
    readonly engineVersion: string;
    readonly input: {
      readonly bytes: number;
      readonly channels: number | null;
      readonly codec: string;
      readonly container: string;
      readonly sampleRate: number | null;
    };
    readonly output: {
      readonly format: string;
      readonly preset: string;
      readonly sampleRate: string;
    };
  },
): void {
  reportDiagnostic("Audio transcoder conversion failed.", error, context);
}

export function reportRuntimeDisposeFailure(error: unknown): void {
  reportDiagnostic(
    "Audio transcoder runtime cleanup failed during tool unmount.",
    error,
  );
}

function readConversionErrorDetails(error: unknown): ConversionErrorDetails {
  return {
    code: readErrorProperty(error, "code"),
    message: readErrorProperty(error, "message"),
    name: readErrorProperty(error, "name"),
    reason: readErrorProperty(error, "reason"),
  };
}

function formatThrownValue(error: unknown): string | null {
  if (typeof error === "string") {
    return error.length > 0 ? error : null;
  }
  if (
    error == null ||
    ["number", "bigint", "boolean", "symbol"].includes(typeof error)
  ) {
    return String(error);
  }
  try {
    const rendered = String(error);
    return rendered === "[object Object]" || rendered.length === 0
      ? null
      : rendered;
  } catch {
    return null;
  }
}

function appendErrorIdentity(
  message: string,
  details: ConversionErrorDetails,
): string {
  const identity = [details.code, details.reason];
  if (details.code === null && details.name !== null) {
    identity.push(details.name);
  }
  const values = identity.filter((value): value is string => value !== null);
  return values.length === 0 ? message : `${message} [${values.join(" · ")}]`;
}

function reportDiagnostic(
  message: string,
  error: unknown,
  context: object = {},
): void {
  const details = readConversionErrorDetails(error);
  try {
    // Browser-local diagnostics never add input filenames or file contents.
    console.error(message, { ...details, ...context, error });
  } catch {
    // Diagnostics must never replace the original failure.
  }
}
