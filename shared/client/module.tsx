import { useEffect, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MantineProvider, Portal } from "@mantine/core";
import { IntlProvider } from "use-intl";
import { theme } from "../lib/theme";
import { resolveLocale, type EmbedSettings } from "./embed";
import {
  ToolRuntimeProvider,
  applyToolLocale,
  type ToolId,
  type ToolRuntimeConfig,
} from "./runtime-context";
import "@mantine/core/styles.css";
import "@mantine/dropzone/styles.css";
import "../styles/global.css";

export interface ToolMountOptions extends EmbedSettings {
  /** Cancels configuration/style loading and destroys a mounted instance. */
  signal?: AbortSignal;
}
export interface ToolMountHandle {
  update(options: EmbedSettings): void;
  destroy(): void;
}
const messages = import.meta.glob("../messages/*.json", {
  eager: true,
  import: "default",
}) as Record<string, Record<string, unknown>>;

function ToolModuleRoot({
  host,
  portalTarget,
  settings,
  config,
  render,
}: {
  host: HTMLElement;
  portalTarget: HTMLElement;
  settings: EmbedSettings;
  config: ToolRuntimeConfig;
  render: () => ReactElement;
}) {
  useEffect(() => {
    applyToolLocale(host, settings.locale);
  }, [host, settings.locale]);
  return (
    <ToolRuntimeProvider config={config}>
      <IntlProvider
        locale={settings.locale}
        messages={messages[`../messages/${settings.locale}.json`]}
      >
        <MantineProvider
          theme={{
            ...theme,
            components: {
              ...theme.components,
              Portal: Portal.extend({ defaultProps: { target: portalTarget } }),
            },
          }}
          forceColorScheme={settings.colorScheme}
          cssVariablesSelector=":host"
          getRootElement={() => host}
          deduplicateInlineStyles={false}
        >
          {render()}
        </MantineProvider>
      </IntlProvider>
    </ToolRuntimeProvider>
  );
}

function loadStylesheet(
  link: HTMLLinkElement,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      link.removeEventListener("load", loaded);
      link.removeEventListener("error", failed);
      signal.removeEventListener("abort", aborted);
    };
    const loaded = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error("Tool stylesheet failed to load."));
    };
    const aborted = () => {
      cleanup();
      reject(signal.reason);
    };
    link.addEventListener("load", loaded, { once: true });
    link.addEventListener("error", failed, { once: true });
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
  });
}

export function createToolMount({
  tool,
  render,
  cssUrl,
  configUrl,
}: {
  tool: ToolId;
  render: () => ReactElement;
  cssUrl: URL;
  configUrl: URL;
}): (host: HTMLElement, options: ToolMountOptions) => Promise<ToolMountHandle> {
  return async (host, options) => {
    options.signal?.throwIfAborted();
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    if (shadow.childNodes.length)
      throw new Error("Tool host already contains a mounted application.");
    const previous = new Map(
      [
        "lang",
        "dir",
        "data-font-profile",
        "data-mantine-color-scheme",
        "data-mantine-respect-reduced-motion",
      ].map((name) => [name, host.getAttribute(name)]),
    );
    const controller = new AbortController();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssUrl.href;
    const container = document.createElement("div");
    container.dataset.toolRoot = tool;
    const portalTarget = document.createElement("div");
    portalTarget.dataset.toolPortals = tool;
    let root: Root | undefined;
    let destroyed = false;
    let settings: EmbedSettings = {
      locale: resolveLocale(options.locale),
      colorScheme: options.colorScheme,
    };
    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      controller.abort();
      options.signal?.removeEventListener("abort", destroy);
      root?.unmount();
      link.remove();
      container.remove();
      portalTarget.remove();
      previous.forEach((value, name) =>
        value === null
          ? host.removeAttribute(name)
          : host.setAttribute(name, value),
      );
    };
    options.signal?.addEventListener("abort", destroy, { once: true });
    const stylesheet = loadStylesheet(link, controller.signal);
    shadow.append(link, container, portalTarget);
    try {
      const configuration = fetch(configUrl, {
        signal: controller.signal,
        credentials: "omit",
      }).then(async (response) => {
        if (!response.ok)
          throw new Error("Tool runtime configuration failed to load.");
        const config = (await response.json()) as ToolRuntimeConfig;
        controller.signal.throwIfAborted();
        if (config.tool !== tool)
          throw new Error(
            "Tool runtime configuration does not match this application.",
          );
        if (!config.parentOrigins.includes(window.location.origin))
          throw new Error("This origin is not authorized to mount the tool.");
        return config;
      });
      const [config] = await Promise.all([configuration, stylesheet]);
      controller.signal.throwIfAborted();
      root = createRoot(container);
      const renderRoot = () =>
        root!.render(
          <ToolModuleRoot
            host={host}
            portalTarget={portalTarget}
            settings={settings}
            config={config}
            render={render}
          />,
        );
      renderRoot();
      return {
        update(next) {
          if (destroyed) return;
          settings = {
            locale: resolveLocale(next.locale),
            colorScheme: next.colorScheme,
          };
          renderRoot();
        },
        destroy,
      };
    } catch (error) {
      destroy();
      throw error;
    }
  };
}
