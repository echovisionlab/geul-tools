import { useEffect, useRef, useState } from "react";
import { createStudioComponent } from "rust-hwp-intl/editor";
import { Loader, Stack, Text, useComputedColorScheme } from "@mantine/core";
import { useLocale } from "use-intl";
import {
  HwpEditorView,
  type HwpEditorLabels,
  type HwpEditorViewProps,
} from "./ui/HwpEditorView";

export interface HwpEditorProps {
  labels: HwpEditorLabels;
}

type Studio = Awaited<ReturnType<typeof createStudioComponent>>;

export function HwpEditor({ labels }: HwpEditorProps) {
  const locale = useLocale();
  const theme = useComputedColorScheme("light");
  const containerRef = useRef<HTMLDivElement>(null);
  const studioRef = useRef<Studio | null>(null);
  const appearanceRef = useRef({ locale, theme });
  const [status, setStatus] = useState<HwpEditorViewProps["status"]>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    appearanceRef.current = { locale, theme };
    studioRef.current?.setAppearance(appearanceRef.current);
  }, [locale, theme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Each startup owns its mount so a late resolution cannot destroy a retry's document.
    const mount = document.createElement("div");
    container.append(mount);
    let disposed = false;
    let studio: Studio | null = null;
    void createStudioComponent(mount, {
      studioUrl: new URL(
        "../vendors/rust-hwp-intl/0.2.1/index.html",
        import.meta.url,
      ).href,
      ...appearanceRef.current,
      scrollMode: "document",
    }).then(
      (readyStudio: Studio) => {
        if (disposed) {
          readyStudio.destroy();
          return;
        }
        studio = readyStudio;
        studioRef.current = readyStudio;
        readyStudio.setAppearance(appearanceRef.current);
        setStatus("ready");
      },
      () => {
        if (!disposed) {
          mount.replaceChildren();
          setStatus("error");
        }
      },
    );
    return () => {
      disposed = true;
      if (studioRef.current === studio) studioRef.current = null;
      studio?.destroy();
      mount.remove();
    };
  }, [attempt]);

  return (
    <HwpEditorView
      labels={labels}
      status={status}
      loadingContent={
        <Stack role="status" align="center" justify="center" p="lg" gap="sm">
          <Loader aria-hidden />
          <Text size="sm">{labels.loading}</Text>
        </Stack>
      }
      editor={<div ref={containerRef} data-hwp-editor-mount />}
      onRetry={() => {
        setStatus("loading");
        setAttempt((value) => value + 1);
      }}
    />
  );
}
