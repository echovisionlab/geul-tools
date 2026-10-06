"use client";

import { useEffect, useRef, useState } from "react";
import { createEditor } from "rust-hwp-intl/editor";
import { Loader, Stack, Text } from "@mantine/core";
import {
  HwpEditorView,
  type HwpEditorLabels,
  type HwpEditorViewProps,
} from "./ui/HwpEditorView";

export interface HwpEditorProps {
  labels: HwpEditorLabels;
}

export function HwpEditor({ labels }: HwpEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<HwpEditorViewProps["status"]>("loading");
  const [attempt, setAttempt] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    // Give each startup its own mount: late readiness cannot remove a retry's iframe.
    const mount = document.createElement("div");
    mount.style.height = "100%";
    container.appendChild(mount);
    let disposed = false;
    let editor: Awaited<ReturnType<typeof createEditor>> | null = null;
    const startup = createEditor(mount, {
      studioUrl: new URL(
        "/vendors/rust-hwp-intl/0.1.0/index.html?scroll=page",
        window.location.origin,
      ).href,
    });
    const iframe = mount.querySelector("iframe");
    const onContentHeight = (event: MessageEvent) => {
      if (
        disposed ||
        !iframe ||
        event.origin !== window.location.origin ||
        event.source !== iframe.contentWindow
      ) {
        return;
      }
      const data = event.data;
      if (
        data?.type === "rhwp:content-height" &&
        typeof data.height === "number" &&
        Number.isFinite(data.height) &&
        data.height > 0
      ) {
        setContentHeight(data.height);
      }
    };
    window.addEventListener("message", onContentHeight);

    void startup.then(
      (readyEditor) => {
        if (disposed) {
          readyEditor.destroy();
          return;
        }
        editor = readyEditor;
        setStatus("ready");
      },
      () => {
        if (!disposed) {
          window.removeEventListener("message", onContentHeight);
          mount.replaceChildren();
          setContentHeight(0);
          setStatus("error");
        }
      },
    );

    return () => {
      disposed = true;
      window.removeEventListener("message", onContentHeight);
      editor?.destroy();
      mount.remove();
    };
  }, [attempt]);

  useEffect(() => {
    containerRef.current
      ?.querySelector("iframe")
      ?.setAttribute("title", labels.label);
  }, [attempt, labels.label]);

  return (
    <HwpEditorView
      labels={labels}
      status={status}
      contentHeight={contentHeight}
      loadingContent={
        <Stack role="status" align="center" justify="center" h="100%" gap="sm">
          <Loader aria-hidden />
          <Text size="sm">{labels.loading}</Text>
        </Stack>
      }
      editor={
        <div
          ref={containerRef}
          style={{ height: "100%" }}
          data-hwp-editor-mount
        />
      }
      onRetry={() => {
        setStatus("loading");
        setContentHeight(0);
        setAttempt((value) => value + 1);
      }}
    />
  );
}
