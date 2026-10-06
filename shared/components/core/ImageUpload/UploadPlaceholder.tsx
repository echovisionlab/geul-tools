"use client";

import type { CSSProperties, ReactNode } from "react";
import { Box, Group, Loader, Progress, Stack, Text } from "@mantine/core";
import classes from "./UploadPlaceholder.module.css";

export interface UploadPlaceholderProps {
  icon: ReactNode;
  title?: string;
  description?: string;
  loading?: boolean;
  progress?: number;
  statusMessage?: string;
  width?: CSSProperties["width"];
  maxWidth?: CSSProperties["maxWidth"];
  height?: CSSProperties["height"];
  minHeight?: CSSProperties["minHeight"];
  aspectRatio?: CSSProperties["aspectRatio"];
  radius?: CSSProperties["borderRadius"];
  interactive?: boolean;
  dropActive?: boolean;
  compact?: boolean;
  showCompactText?: boolean;
  className?: string;
}

export function UploadPlaceholder({
  icon,
  title,
  description,
  loading = false,
  progress,
  statusMessage,
  width,
  maxWidth,
  height,
  minHeight,
  aspectRatio,
  radius,
  interactive = false,
  dropActive = false,
  compact = false,
  showCompactText = false,
  className,
}: UploadPlaceholderProps) {
  const normalizedProgress =
    typeof progress === "number"
      ? Math.max(0, Math.min(100, Math.round(progress)))
      : null;

  return (
    <Box
      className={[classes.surface, className].filter(Boolean).join(" ")}
      data-compact={compact || undefined}
      data-interactive={interactive || undefined}
      data-drop-active={dropActive || undefined}
      data-loading={loading || undefined}
      style={{
        width,
        maxWidth,
        height,
        minHeight,
        aspectRatio,
        borderRadius: radius,
      }}
    >
      {loading ? (
        <Stack gap={compact ? 4 : "xs"} align="center" w="100%">
          <Loader size={compact ? "xs" : "sm"} />
          {(!compact || showCompactText) && (title || statusMessage) && (
            <div className={classes.text}>
              <Group
                gap={6}
                justify="center"
                wrap="nowrap"
                className={classes.statusRow}
              >
                <Text className={classes.title}>{statusMessage ?? title}</Text>
                {normalizedProgress !== null && (
                  <Text className={classes.description}>
                    {normalizedProgress}%
                  </Text>
                )}
              </Group>
              {normalizedProgress !== null && (
                <Progress
                  value={normalizedProgress}
                  size="sm"
                  animated
                  className={classes.progress}
                />
              )}
            </div>
          )}
        </Stack>
      ) : (
        <>
          <div className={classes.icon}>{icon}</div>
          {(!compact || showCompactText) && (title || description) && (
            <div className={classes.text}>
              {title && <Text className={classes.title}>{title}</Text>}
              {description && (
                <Text className={classes.description}>{description}</Text>
              )}
            </div>
          )}
        </>
      )}
    </Box>
  );
}
