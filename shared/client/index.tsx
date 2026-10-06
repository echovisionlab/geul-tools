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

export type ToolId = "transcode" | "youtube-audio" | "hwp" | "portadj";
export interface ToolRuntimeConfig {
  tool: ToolId;
  parentOrigins: string[];
  fontCdnOrigin?: string;
  apiOrigin?: string;
}
declare global {
  interface Window {
    __GEUL_TOOL_CONFIG__: ToolRuntimeConfig;
  }
}
const messages = import.meta.glob("../messages/*.json", {
  eager: true,
  import: "default",
}) as Record<string, Record<string, unknown>>;
const fontProfiles: Record<string, string> = {
  ko: "korean",
  ja: "japanese",
  "zh-CN": "chinese-simplified",
  "zh-TW": "chinese-traditional",
  ar: "arabic",
};
const fontFamilies: Record<string, string> = {
  ko: "Noto+Sans+KR:wght@100..900",
  ja: "Noto+Sans+JP:wght@100..900",
  "zh-CN": "Noto+Sans+SC:wght@100..900",
  "zh-TW": "Noto+Sans+TC:wght@100..900",
  ar: "Noto+Sans+Arabic:wght@100..900",
};

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
    document.documentElement.lang = settings.locale;
    document.documentElement.dir = settings.locale === "ar" ? "rtl" : "ltr";
    document.documentElement.dataset.fontProfile =
      fontProfiles[settings.locale] ?? "latin";
    const link = document.createElement("link");
    link.rel = "stylesheet";
    const families = [
      "Noto+Sans:wght@100..900",
      ...(fontFamilies[settings.locale] ? [fontFamilies[settings.locale]] : []),
      "Noto+Sans+Mono:wght@100..900",
      "Noto+Color+Emoji",
    ];
    link.href = `${config.fontCdnOrigin ?? "https://cdn.dsub.io"}/fonts/css2?${families.map((family) => `family=${family}`).join("&")}&display=swap`;
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
