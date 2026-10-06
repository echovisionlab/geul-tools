// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import {
  ToolRuntimeProvider,
  useToolRuntimeConfig,
  type ToolRuntimeConfig,
} from "./runtime-context";

it("keeps runtime configuration isolated per provider and does not read the legacy global", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const first: ToolRuntimeConfig = {
    tool: "transcode",
    parentOrigins: [],
    apiOrigin: "https://first.invalid",
  };
  const second: ToolRuntimeConfig = {
    tool: "youtube-audio",
    parentOrigins: [],
    apiOrigin: "https://second.invalid",
  };
  const globalConfig = window.__GEUL_TOOL_CONFIG__;
  window.__GEUL_TOOL_CONFIG__ = first;
  function Value({ id }: { id: string }) {
    return (
      <span id={id}>{useToolRuntimeConfig()?.apiOrigin ?? "no-provider"}</span>
    );
  }
  try {
    act(() =>
      root.render(
        <>
          <Value id="outside" />
          <ToolRuntimeProvider config={first}>
            <Value id="first" />
          </ToolRuntimeProvider>
          <ToolRuntimeProvider config={second}>
            <Value id="second" />
          </ToolRuntimeProvider>
        </>,
      ),
    );
    expect(container.querySelector("#outside")?.textContent).toBe(
      "no-provider",
    );
    expect(container.querySelector("#first")?.textContent).toBe(
      first.apiOrigin,
    );
    expect(container.querySelector("#second")?.textContent).toBe(
      second.apiOrigin,
    );
  } finally {
    act(() => root.unmount());
    container.remove();
    if (globalConfig) window.__GEUL_TOOL_CONFIG__ = globalConfig;
    else delete (window as Partial<Window>).__GEUL_TOOL_CONFIG__;
  }
});
