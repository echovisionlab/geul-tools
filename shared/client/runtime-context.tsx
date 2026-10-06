import { createContext, useContext, type ReactNode } from "react";

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

const ToolRuntimeContext = createContext<ToolRuntimeConfig | null>(null);
export function ToolRuntimeProvider({
  config,
  children,
}: {
  config: ToolRuntimeConfig;
  children: ReactNode;
}) {
  return (
    <ToolRuntimeContext.Provider value={config}>
      {children}
    </ToolRuntimeContext.Provider>
  );
}
export function useToolRuntimeConfig(): ToolRuntimeConfig | null {
  return useContext(ToolRuntimeContext);
}

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
export function applyToolLocale(host: HTMLElement, locale: string): void {
  host.lang = locale;
  host.dir = locale === "ar" ? "rtl" : "ltr";
  host.dataset.fontProfile = fontProfiles[locale] ?? "latin";
}
export function toolFontUrl(config: ToolRuntimeConfig, locale: string): string {
  const families = [
    "Noto+Sans:wght@100..900",
    ...(fontFamilies[locale] ? [fontFamilies[locale]] : []),
    "Noto+Sans+Mono:wght@100..900",
    "Noto+Color+Emoji",
  ];
  return `${config.fontCdnOrigin ?? "https://cdn.dsub.io"}/fonts/css2?${families.map((family) => `family=${family}`).join("&")}&display=swap`;
}
