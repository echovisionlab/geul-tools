"use client";

import type { CSSProperties, ReactNode } from "react";
import { Box, Stack } from "@mantine/core";
import { Alert } from "@/components/core/Alert";
import { Button } from "@/components/core/Button";
import classes from "./HwpEditorView.module.css";

export interface HwpEditorLabels {
  label: string;
  loading: string;
  error: string;
  retry: string;
}

export interface HwpEditorViewProps {
  labels: HwpEditorLabels;
  status: "loading" | "ready" | "error";
  contentHeight: number;
  loadingContent: ReactNode;
  editor: ReactNode;
  onRetry: () => void;
}

export function HwpEditorView({
  labels,
  status,
  contentHeight,
  loadingContent,
  editor,
  onRetry,
}: HwpEditorViewProps) {
  return (
    <Box
      className={classes.editor}
      style={
        {
          "--hwp-editor-height":
            contentHeight > 0 ? `${contentHeight}px` : undefined,
        } as CSSProperties
      }
      aria-label={labels.label}
      aria-busy={status === "loading"}
    >
      {editor}
      {status === "loading" ? (
        <Box pos="absolute" inset={0} bg="var(--mantine-color-body)">
          {loadingContent}
        </Box>
      ) : null}
      {status === "error" ? (
        <Stack
          pos="absolute"
          inset={0}
          align="center"
          justify="center"
          p="lg"
          bg="var(--mantine-color-body)"
        >
          <Alert tone="danger">{labels.error}</Alert>
          <Button size="sm" onClick={onRetry}>
            {labels.retry}
          </Button>
        </Stack>
      ) : null}
    </Box>
  );
}
