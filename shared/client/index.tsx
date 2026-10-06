import { useEffect, useRef, useState, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { IntlProvider } from "use-intl";
import { theme } from "../lib/theme";
import {
  readEmbedInit,
  resolveLocale,
  sendEmbedResize,
  type EmbedSettings,
} from "./embed";
import "@mantine/core/styles.css";
import "@mantine/dropzone/styles.css";
import "../styles/global.css";

import {
  ToolRuntimeProvider,
  applyToolLocale,
  toolFontUrl,
  type ToolId,
  type ToolRuntimeConfig,
} from "./runtime-context";
export type { ToolId, ToolRuntimeConfig } from "./runtime-context";
const messages = import.meta.glob("../messages/*.json", {
  eager: true,
  import: "default",
}) as Record<string, Record<string, unknown>>;
function ToolRoot({
  render,
  config,
}: {
  render: () => ReactElement;
  config: ToolRuntimeConfig;
}) {
  const [settings, setSettings] = useState<EmbedSettings>(() => ({
    locale: resolveLocale(
      new URLSearchParams(window.location.search).get("locale") ??
        navigator.language,
    ),
    colorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  }));
  const parentOrigin = useRef<string | null>(null);
  useEffect(() => {
    applyToolLocale(document.documentElement, settings.locale);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = toolFontUrl(config, settings.locale);
    document.head.append(link);
    return () => link.remove();
  }, [config.fontCdnOrigin, settings.locale]);
  useEffect(() => {
    if (window.parent === window) return;
    const resize = () =>
      sendEmbedResize(
        window.parent,
        parentOrigin.current,
        document.getElementById("root")!.getBoundingClientRect().height,
      );
    const onMessage = (event: MessageEvent) => {
      const next = readEmbedInit(event, window.parent, config.parentOrigins);
      if (!next) return;
      parentOrigin.current = event.origin;
      setSettings(next);
      resize();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(document.getElementById("root")!);
    window.addEventListener("message", onMessage);
    for (const origin of config.parentOrigins) {
      window.parent.postMessage({ type: "geul:embed:ready" }, origin);
    }
    return () => {
      observer.disconnect();
      window.removeEventListener("message", onMessage);
    };
  }, [config.parentOrigins]);
  return (
    <ToolRuntimeProvider config={config}>
      <IntlProvider
        locale={settings.locale}
        messages={messages[`../messages/${settings.locale}.json`]}
      >
        <MantineProvider
          theme={theme}
          forceColorScheme={settings.colorScheme}
          deduplicateInlineStyles
        >
          {render()}
        </MantineProvider>
      </IntlProvider>
    </ToolRuntimeProvider>
  );
}

export function mountTool({
  tool,
  render,
}: {
  tool: ToolId;
  render: () => ReactElement;
}): void {
  const config = window.__GEUL_TOOL_CONFIG__;
  if (!config || config.tool !== tool)
    throw new Error(
      "Tool runtime configuration does not match this application.",
    );
  createRoot(document.getElementById("root")!).render(
    <ToolRoot render={render} config={config} />,
  );
}
