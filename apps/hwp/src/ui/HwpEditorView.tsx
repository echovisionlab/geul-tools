import type { ReactNode } from "react";
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
  loadingContent: ReactNode;
  editor: ReactNode;
  onRetry: () => void;
}

export function HwpEditorView({
  labels,
  status,
  loadingContent,
  editor,
  onRetry,
}: HwpEditorViewProps) {
  return (
    <Box
      className={classes.editor}
      aria-label={labels.label}
      aria-busy={status === "loading"}
      data-status={status}
    >
      {editor}
      {status === "loading" ? (
        <Box className={classes.status}>{loadingContent}</Box>
      ) : null}
      {status === "error" ? (
        <Stack
          className={classes.status}
          align="center"
          justify="center"
          p="lg"
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
