export interface EmbedSettings {
  locale: string;
  colorScheme: "light" | "dark";
}

export const supportedLocales = [
  "ar",
  "de",
  "en",
  "es-419",
  "es",
  "fr",
  "id",
  "it",
  "ja",
  "ko",
  "nl",
  "pl",
  "pt-BR",
  "pt-PT",
  "ru",
  "th",
  "tr",
  "vi",
  "zh-CN",
  "zh-TW",
] as const;
export function resolveLocale(locale: string): string {
  const exact = supportedLocales.find(
    (value) => value.toLowerCase() === locale.toLowerCase(),
  );
  if (exact) return exact;
  return (
    supportedLocales.find((value) => value === locale.split("-")[0]) ?? "en"
  );
}

export function readEmbedInit(
  event: MessageEvent,
  parent: Window,
  parentOrigins: readonly string[],
): EmbedSettings | null {
  if (event.source !== parent || !parentOrigins.includes(event.origin))
    return null;
  const data: unknown = event.data;
  if (
    typeof data !== "object" ||
    data === null ||
    !("type" in data) ||
    data.type !== "geul:embed:init" ||
    !("locale" in data) ||
    typeof data.locale !== "string" ||
    !("colorScheme" in data) ||
    (data.colorScheme !== "light" && data.colorScheme !== "dark")
  )
    return null;
  return { locale: resolveLocale(data.locale), colorScheme: data.colorScheme };
}

export function sendEmbedResize(
  parent: Window,
  parentOrigin: string | null,
  height: number,
): void {
  if (parentOrigin && Number.isFinite(height) && height > 0) {
    parent.postMessage(
      { type: "geul:embed:resize", height: Math.ceil(height) },
      parentOrigin,
    );
  }
}
