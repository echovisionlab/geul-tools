import { useId } from "react";
import {
  IconAlertTriangle,
  IconArrowDown,
  IconCheck,
  IconDownload,
  IconFileMusic,
  IconPlayerStop,
  IconRefresh,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import {
  Divider,
  Flex,
  Group,
  SimpleGrid,
  Stack,
  Text,
  VisuallyHidden,
} from "@mantine/core";
import { Alert } from "@/components/core/Alert";
import { StatusBadge, type StatusBadgeTone } from "@/components/core/Badge";
import { Button } from "@/components/core/Button";
import { Disclosure } from "@/components/core/Disclosure";
import { IconButton } from "@/components/core/IconButton";
import { NativeSelect } from "@/components/core/Input";
import { FileDropzone } from "@/components/core/Input/FileDropzone";
import { Progress } from "@/components/core/Progress";
import { PageHeader } from "@/components/core/PageHeader";
import { SectionCard, SectionHeader } from "@/components/core/Section";
import { TextButton } from "@/components/core/TextButton";

export type AudioTranscodeFileStatus =
  | "inspecting"
  | "ready"
  | "queued"
  | "converting"
  | "complete"
  | "unsupported"
  | "error";

export type AudioTranscodeTargetStatus =
  "idle" | "checking" | "ready" | "error";

export interface AudioTranscodeOption {
  disabled?: boolean;
  value: string;
  label: string;
}

export interface AudioTranscodeEncodingControl {
  id: string;
  label: string;
  value: string;
  options: readonly AudioTranscodeOption[];
}

/** Display-ready data only. Runtime and package types must be projected before reaching the View. */
export interface AudioTranscodeFileViewModel {
  id: string;
  name: string;
  sizeLabel: string;
  sourceSummary: string;
  outputSummary: string | null;
  status: AudioTranscodeFileStatus;
  statusLabel: string;
  message: string | null;
  messageIsError?: boolean;
  progress: number | null;
  progressLabel: string | null;
  downloadHref: string | null;
  canDownloadSource?: boolean;
  downloadName: string | null;
  canRetry: boolean;
  canCancel: boolean;
  canRemove: boolean;
}

export interface AudioTranscodeToolLabels {
  title: string;
  description: string;
  notices: string;
  targetIdle: string;
  targetChecking: string;
  targetReady: string;
  targetError: string;
  dropTitle: string;
  dropDescription: string;
  chooseFiles: string;
  supportedFormatsLabel: string;
  supportedFormats: string;
  filesSelected: string;
  outputSettings: string;
  outputSettingsHelper: string;
  processingDetails: string;
  processingDetailsDescription: string;
  format: string;
  sampleRate: string;
  queue: string;
  convert: string;
  cancelAll: string;
  clear: string;
  download: string;
  downloadSource: string;
  retry: string;
  cancel: string;
  remove: string;
}

export interface AudioTranscodeToolViewProps {
  labels: AudioTranscodeToolLabels;
  /** Null embeds the converter without a second page heading or description. */
  title?: string | null;
  files: readonly AudioTranscodeFileViewModel[];
  accept: string;
  maxFiles: number;
  noticesHref: string;
  format: string;
  formatOptions: readonly AudioTranscodeOption[];
  sampleRate: string;
  sampleRateOptions: readonly AudioTranscodeOption[];
  encodingControls: readonly AudioTranscodeEncodingControl[];
  /** Undefined hides engine loading progress; null renders an indeterminate Core progress bar. */
  engineLoadingProgress?: number | null;
  targetStatus: AudioTranscodeTargetStatus;
  targetMessage: string | null;
  capacityError: string | null;
  statusMessage: string | null;
  settingsNotice: string | null;
  canAddFiles: boolean;
  canConvertAll: boolean;
  canCancelAll: boolean;
  canClear: boolean;
  isConverting: boolean;
  showFilePicker?: boolean;
  onFilesSelected: (files: readonly File[]) => void;
  onFormatChange: (value: string) => void;
  onSampleRateChange: (value: string) => void;
  onEncodingChange: (id: string, value: string) => void;
  onConvertAll: () => void;
  onCancelAll: () => void;
  onClear: () => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onDownloadSource?: (id: string) => void;
}

const FILE_STATUS_TONES: Record<AudioTranscodeFileStatus, StatusBadgeTone> = {
  inspecting: "neutral",
  ready: "positive",
  queued: "neutral",
  converting: "accent",
  complete: "positive",
  unsupported: "warning",
  error: "danger",
};

const TARGET_STATUS_TONES: Record<AudioTranscodeTargetStatus, StatusBadgeTone> =
  {
    idle: "neutral",
    checking: "accent",
    ready: "positive",
    error: "danger",
  };

function clampProgress(progress: number | null) {
  if (progress === null || !Number.isFinite(progress)) {
    return 0;
  }

  return Math.max(0, Math.min(100, progress));
}

function targetStatusLabel(
  status: AudioTranscodeTargetStatus,
  labels: AudioTranscodeToolLabels,
) {
  switch (status) {
    case "idle":
      return labels.targetIdle;
    case "checking":
      return labels.targetChecking;
    case "ready":
      return labels.targetReady;
    case "error":
      return labels.targetError;
  }
}

function FileStatusIcon({ status }: { status: AudioTranscodeFileStatus }) {
  switch (status) {
    case "inspecting":
    case "converting":
    case "ready":
      return null;
    case "queued":
      return <IconArrowDown aria-hidden size={18} />;
    case "complete":
      return <IconCheck aria-hidden size={18} />;
    case "unsupported":
    case "error":
      return <IconAlertTriangle aria-hidden size={18} />;
  }
}

interface FileRowProps {
  divided: boolean;
  file: AudioTranscodeFileViewModel;
  labels: AudioTranscodeToolLabels;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onDownloadSource?: (id: string) => void;
}

function FileRow({
  divided,
  file,
  labels,
  onRetry,
  onCancel,
  onRemove,
  onDownloadSource,
}: FileRowProps) {
  const progress = clampProgress(file.progress);
  const isInspecting = file.status === "inspecting";
  const isProgressVisible =
    isInspecting || (file.status === "converting" && file.progress !== null);
  const metadata = [
    file.sourceSummary,
    file.sizeLabel,
    file.outputSummary ? `→ ${file.outputSummary}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const messageIsError =
    file.messageIsError === true ||
    file.status === "error" ||
    file.status === "unsupported";

  return (
    <Stack
      component="li"
      gap={0}
      p={0}
      aria-busy={file.status === "inspecting" || file.status === "converting"}
      data-file-status={file.status}
    >
      {divided ? <Divider /> : null}
      <Flex
        p="md"
        gap="md"
        align={{ base: "stretch", sm: "flex-start" }}
        direction={{ base: "column", sm: "row" }}
      >
        <Group gap="sm" align="flex-start" wrap="nowrap" miw={0} flex={1}>
          <FileStatusIcon status={file.status} />

          <Stack gap={4} miw={0} flex={1}>
            <Group gap="xs" align="center" wrap="wrap">
              <Text component="strong" fw={600} lineClamp={2} title={file.name}>
                {file.name}
              </Text>
              <StatusBadge tone={FILE_STATUS_TONES[file.status]}>
                {file.statusLabel}
              </StatusBadge>
            </Group>
            <Text size="xs" c="dimmed" ff="monospace">
              {metadata}
            </Text>

            {isProgressVisible ? (
              <Group gap="xs" wrap="nowrap">
                <Progress
                  data-audio-transcode-progress
                  value={isInspecting ? null : progress}
                  size="md"
                  flex={1}
                  aria-label={
                    isInspecting
                      ? file.statusLabel
                      : (file.progressLabel ?? file.statusLabel)
                  }
                  aria-valuetext={
                    isInspecting
                      ? undefined
                      : (file.progressLabel ?? `${Math.round(progress)}%`)
                  }
                />
                {isInspecting ? null : (
                  <Text size="xs" c="blue" fw={600} ff="monospace">
                    {Math.round(progress)}%
                  </Text>
                )}
              </Group>
            ) : null}

            {file.message ? (
              <Text
                size="xs"
                c={messageIsError ? "red" : "dimmed"}
                role={messageIsError ? "alert" : undefined}
              >
                {file.message}
              </Text>
            ) : null}
          </Stack>
        </Group>

        <Flex
          gap="xs"
          justify={{ base: "flex-start", sm: "flex-end" }}
          wrap="wrap"
        >
          {file.canDownloadSource && onDownloadSource ? (
            <Button
              size="xs"
              emphasis="medium"
              leftSection={<IconDownload aria-hidden size={15} />}
              onClick={() => onDownloadSource(file.id)}
              aria-label={`${labels.downloadSource}: ${file.name}`}
            >
              {labels.downloadSource}
            </Button>
          ) : null}
          {file.status === "complete" &&
          file.downloadHref &&
          file.downloadName ? (
            <Button
              component="a"
              href={file.downloadHref}
              download={file.downloadName}
              size="xs"
              emphasis="medium"
              leftSection={<IconDownload aria-hidden size={15} />}
              aria-label={`${labels.download}: ${file.name}`}
            >
              {labels.download}
            </Button>
          ) : null}
          {file.canRetry ? (
            <IconButton
              controlSize="xs"
              emphasis="low"
              aria-label={`${labels.retry}: ${file.name}`}
              onClick={() => onRetry(file.id)}
            >
              <IconRefresh aria-hidden size={15} />
            </IconButton>
          ) : null}
          {file.canCancel ? (
            <IconButton
              controlSize="xs"
              tone="warning"
              emphasis="low"
              aria-label={`${labels.cancel}: ${file.name}`}
              onClick={() => onCancel(file.id)}
            >
              <IconX aria-hidden size={15} />
            </IconButton>
          ) : null}
          {file.canRemove ? (
            <IconButton
              controlSize="xs"
              tone="neutral"
              emphasis="low"
              aria-label={`${labels.remove}: ${file.name}`}
              onClick={() => onRemove(file.id)}
            >
              <IconTrash aria-hidden size={15} />
            </IconButton>
          ) : null}
        </Flex>
      </Flex>
    </Stack>
  );
}

export function AudioTranscodeToolView({
  labels,
  title = labels.title,
  files,
  accept,
  maxFiles,
  noticesHref,
  format,
  formatOptions,
  sampleRate,
  sampleRateOptions,
  encodingControls,
  engineLoadingProgress,
  targetStatus,
  targetMessage,
  capacityError,
  statusMessage,
  settingsNotice,
  canAddFiles,
  canConvertAll,
  canCancelAll,
  canClear,
  isConverting,
  showFilePicker = true,
  onFilesSelected,
  onFormatChange,
  onSampleRateChange,
  onEncodingChange,
  onConvertAll,
  onCancelAll,
  onClear,
  onRetry,
  onCancel,
  onRemove,
  onDownloadSource,
}: AudioTranscodeToolViewProps) {
  const titleId = useId();
  const isAtCapacity = files.length >= maxFiles;
  const inputDisabled = isConverting || !canAddFiles || isAtCapacity;

  return (
    <Stack gap="xl" data-audio-transcode-tool>
      {title === null ? null : (
        <PageHeader title={title} description={labels.description} />
      )}

      <SectionCard
        component="section"
        aria-labelledby={`${titleId}-settings-title`}
      >
        <Stack gap="md">
          <SectionHeader
            title={
              <span id={`${titleId}-settings-title`}>
                {labels.outputSettings}
              </span>
            }
            description={
              targetMessage ? (
                <span role={targetStatus === "error" ? "alert" : undefined}>
                  {targetMessage}
                </span>
              ) : undefined
            }
            actions={
              <StatusBadge
                data-audio-transcode-target-status
                flex="none"
                tone={TARGET_STATUS_TONES[targetStatus]}
              >
                {targetStatusLabel(targetStatus, labels)}
              </StatusBadge>
            }
          />
          {engineLoadingProgress !== undefined ? (
            <Progress
              data-audio-transcode-engine-progress
              value={engineLoadingProgress}
              striped
              animated
              aria-label={targetMessage ?? labels.targetChecking}
            />
          ) : null}
          <SimpleGrid
            cols={{ base: 1, sm: Math.min(4, 2 + encodingControls.length) }}
          >
            <NativeSelect
              label={labels.format}
              value={format}
              data={formatOptions.map(toNativeSelectOption)}
              disabled={isConverting}
              onChange={(event) => onFormatChange(event.currentTarget.value)}
            />
            <NativeSelect
              label={labels.sampleRate}
              value={sampleRate}
              data={sampleRateOptions.map(toNativeSelectOption)}
              disabled={isConverting}
              onChange={(event) =>
                onSampleRateChange(event.currentTarget.value)
              }
            />
            {encodingControls.map((control) => (
              <NativeSelect
                key={control.id}
                label={control.label}
                value={control.value}
                data={control.options.map(toNativeSelectOption)}
                disabled={isConverting}
                onChange={(event) =>
                  onEncodingChange(control.id, event.currentTarget.value)
                }
              />
            ))}
          </SimpleGrid>
          <Disclosure
            label={labels.processingDetails}
            density="compact"
            contentIndent="small"
          >
            <Stack gap="xs">
              <Text size="xs" c="dimmed">
                {labels.outputSettingsHelper}
              </Text>
              <Text size="xs" c="dimmed">
                {labels.processingDetailsDescription}
              </Text>
            </Stack>
          </Disclosure>
          {settingsNotice ? (
            <Alert data-audio-transcode-settings-notice tone="accent">
              {settingsNotice}
            </Alert>
          ) : null}
        </Stack>
      </SectionCard>

      <SectionCard
        component="section"
        p={0}
        aria-labelledby={`${titleId}-queue-title`}
      >
        <Stack gap={0}>
          <Stack p="md" gap="md">
            <SectionHeader
              title={<span id={`${titleId}-queue-title`}>{labels.queue}</span>}
              actions={
                <Group
                  data-audio-transcode-queue-actions
                  gap="xs"
                  wrap="nowrap"
                >
                  {canClear ? (
                    <Button
                      size="xs"
                      tone="neutral"
                      emphasis="low"
                      onClick={onClear}
                    >
                      {labels.clear}
                    </Button>
                  ) : null}
                  {canCancelAll ? (
                    <Button
                      size="xs"
                      tone="warning"
                      emphasis="medium"
                      leftSection={<IconPlayerStop aria-hidden size={15} />}
                      onClick={onCancelAll}
                    >
                      {labels.cancelAll}
                    </Button>
                  ) : (
                    <Button
                      size="xs"
                      emphasis="medium"
                      loading={isConverting}
                      disabled={!canConvertAll}
                      onClick={onConvertAll}
                    >
                      {labels.convert}
                    </Button>
                  )}
                </Group>
              }
            />
            {showFilePicker ? (
              <>
                <FileDropzone
                  label={labels.chooseFiles}
                  title={labels.dropTitle}
                  description={labels.dropDescription}
                  icon={<IconFileMusic aria-hidden size={28} />}
                  accept={accept}
                  multiple
                  maxFiles={maxFiles}
                  disabled={inputDisabled}
                  onFilesSelected={onFilesSelected}
                  onFilesRejected={(rejections) =>
                    onFilesSelected(rejections.map(({ file }) => file))
                  }
                />

                <Disclosure
                  label={labels.supportedFormatsLabel}
                  appearance="plain"
                  density="compact"
                  contentIndent="small"
                >
                  <Text size="xs" c="dimmed">
                    {labels.supportedFormats}
                  </Text>
                </Disclosure>

                <Text size="xs" c="dimmed" ff="monospace">
                  {labels.filesSelected}: {files.length} / {maxFiles}
                </Text>

                {capacityError ? (
                  <Alert
                    data-audio-transcode-capacity-error
                    tone="danger"
                    icon={<IconAlertTriangle aria-hidden size={18} />}
                    role="alert"
                  >
                    {capacityError}
                  </Alert>
                ) : null}
              </>
            ) : null}
          </Stack>

          {files.length > 0 ? (
            <>
              <Divider />
              <Stack component="ul" gap={0} m={0} p={0}>
                {files.map((file, index) => (
                  <FileRow
                    key={file.id}
                    divided={index > 0}
                    file={file}
                    labels={labels}
                    onRetry={onRetry}
                    onCancel={onCancel}
                    onRemove={onRemove}
                    onDownloadSource={onDownloadSource}
                  />
                ))}
              </Stack>
            </>
          ) : null}
        </Stack>
      </SectionCard>

      <VisuallyHidden aria-live="polite" aria-atomic="true">
        {statusMessage}
      </VisuallyHidden>

      <Group justify="flex-end">
        <TextButton
          href={noticesHref}
          linkComponent="a"
          target="_blank"
          rel="noopener noreferrer"
          appearance="muted"
          size="xs"
        >
          {labels.notices}
        </TextButton>
      </Group>
    </Stack>
  );
}

function toNativeSelectOption({
  disabled,
  label,
  value,
}: AudioTranscodeOption) {
  return { disabled, label, value };
}
