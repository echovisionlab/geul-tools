"use client";

import { useId, type ReactNode, type SubmitEvent } from "react";
import { Group, Stack } from "@mantine/core";
import { Alert } from "@/components/core/Alert";
import { Button } from "@/components/core/Button";
import { Field } from "@/components/core/Field";
import { TextInput } from "@/components/core/Input";
import { PageHeader } from "@/components/core/PageHeader";

export interface YoutubeAudioToolLabels {
  title: string;
  description: string;
  urlLabel: string;
  urlPlaceholder: string;
  resolve: string;
  resolving: string;
  clear: string;
}

export interface YoutubeAudioToolViewProps {
  labels: YoutubeAudioToolLabels;
  url: string;
  resolving: boolean;
  error: string | null;
  resolvedTitle: string | null;
  converter: ReactNode;
  onUrlChange: (value: string) => void;
  onResolve: () => void;
  onClear: () => void;
}

export function YoutubeAudioToolView({
  labels,
  url,
  resolving,
  error,
  resolvedTitle,
  converter,
  onUrlChange,
  onResolve,
  onClear,
}: YoutubeAudioToolViewProps) {
  const urlId = useId();

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    onResolve();
  };

  return (
    <Stack gap="xl" data-youtube-audio-tool>
      <PageHeader title={labels.title} description={labels.description} />

      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <Field label={labels.urlLabel} htmlFor={urlId} error={error} required>
            <TextInput
              id={urlId}
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder={labels.urlPlaceholder}
              value={url}
              disabled={resolving}
              onChange={(event) => onUrlChange(event.currentTarget.value)}
            />
          </Field>
          {resolvedTitle ? (
            <Alert tone="positive">{resolvedTitle}</Alert>
          ) : null}
          <Group justify="flex-end" gap="xs">
            {resolvedTitle ? (
              <Button
                type="button"
                size="xs"
                tone="neutral"
                emphasis="low"
                disabled={resolving}
                onClick={onClear}
              >
                {labels.clear}
              </Button>
            ) : null}
            <Button
              type="submit"
              size="xs"
              emphasis="medium"
              loading={resolving}
              disabled={url.trim().length === 0}
            >
              {resolving ? labels.resolving : labels.resolve}
            </Button>
          </Group>
        </Stack>
      </form>

      {converter}
    </Stack>
  );
}
