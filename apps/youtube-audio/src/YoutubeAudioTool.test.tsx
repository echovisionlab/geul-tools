// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IntlProvider } from "use-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRuntimeProvider } from "@/shared/client/runtime-context";
import enMessages from "@/shared/messages/en.json";
import type { AudioTranscodeToolProps } from "@/audio-client/AudioTranscodeTool";
import type { YoutubeAudioToolViewProps } from "./ui";
import { YoutubeAudioTool } from "./YoutubeAudioTool";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let viewProps: YoutubeAudioToolViewProps | null = null;
let transcodeProps: AudioTranscodeToolProps | null = null;

vi.mock("./ui", () => ({
  YoutubeAudioToolView: (props: YoutubeAudioToolViewProps) => {
    viewProps = props;
    return (
      <div data-youtube-audio-view>
        <button
          data-source-input
          onClick={() => props.onUrlChange("https://youtu.be/abcdefghijk")}
        >
          Set URL
        </button>
        <button data-resolve onClick={props.onResolve}>
          Load
        </button>
        {props.converter}
      </div>
    );
  },
}));

vi.mock("@/audio-client/AudioTranscodeTool", () => ({
  AudioTranscodeTool: (props: AudioTranscodeToolProps) => {
    transcodeProps = props;
    return (
      <div
        data-audio-transcoder
        data-http-url={
          props.externalSource && "http" in props.externalSource.input
            ? props.externalSource.input.http?.url
            : undefined
        }
        data-download-url={props.externalSource?.downloadUrl}
      />
    );
  },
}));

const resolved = {
  contentType: "audio/mp4",
  expiresAt: 2_000_000_000_000,
  input: {
    http: {
      credentials: "include" as const,
      size: 123_456,
      url: "https://www.example.invalid/api/tools/youtube-audio/sources/source_12345678",
    },
    name: "Reference.m4a",
  },
  sourceId: "source_12345678",
  title: "Reference",
  videoId: "abcdefghijk",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  viewProps = null;
  transcodeProps = null;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function render(fetcher: typeof fetch, apiOrigin?: string) {
  act(() => {
    root.render(
      <IntlProvider locale="en" messages={enMessages}>
        <ToolRuntimeProvider
          config={{ tool: "youtube-audio", parentOrigins: [], apiOrigin }}
        >
          <YoutubeAudioTool fetcher={fetcher} />
        </ToolRuntimeProvider>
      </IntlProvider>,
    );
  });
}

function props(): YoutubeAudioToolViewProps {
  if (viewProps === null) {
    throw new Error("Expected YouTube audio view props");
  }
  return viewProps;
}

describe("YoutubeAudioTool", () => {
  it("resolves one authenticated source and passes its HTTP range descriptor to the existing transcoder", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify(resolved), { status: 200 }),
      );
    render(fetcher);

    act(() => props().onUrlChange("https://youtu.be/abcdefghijk"));
    await act(async () => props().onResolve());
    await vi.waitFor(() => expect(props().resolvedTitle).toBe("Reference"));

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/tools/youtube-audio/resolve",
      expect.objectContaining({
        body: JSON.stringify({ url: "https://youtu.be/abcdefghijk" }),
        credentials: "include",
        method: "POST",
      }),
    );
    expect(props().labels.description).toBe(
      enMessages.tools.youtubeAudio.metadataDescription,
    );
    expect(transcodeProps).toMatchObject({
      externalSource: {
        id: resolved.sourceId,
        downloadUrl: `/api/tools/youtube-audio/sources/${resolved.sourceId}?download=1`,
        input: resolved.input,
        name: resolved.input.name,
        size: resolved.input.http.size,
      },
      initialFormat: "mp3",
      title: null,
    });
  });

  it("resolves relative source URLs against the mini app origin for HTTP inspection", async () => {
    const relative = {
      ...resolved,
      input: {
        ...resolved.input,
        http: {
          ...resolved.input.http,
          url: `/api/tools/youtube-audio/sources/${resolved.sourceId}`,
        },
      },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify(relative), { status: 200 }),
      );
    render(fetcher);
    act(() => props().onUrlChange("https://youtu.be/abcdefghijk"));
    await act(async () => props().onResolve());
    await vi.waitFor(() =>
      expect(transcodeProps?.externalSource?.input).toMatchObject({
        http: {
          url: new URL(relative.input.http.url, window.location.origin).href,
        },
      }),
    );
  });

  it("sends resolve, source inspection, original download, and revoke through the credentialed configured API origin", async () => {
    const apiOrigin = "https://www.dsub.io";
    const relative = {
      ...resolved,
      input: {
        ...resolved.input,
        http: {
          ...resolved.input.http,
          url: `/api/tools/youtube-audio/sources/${resolved.sourceId}`,
        },
      },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(relative), { status: 200 }),
      )
      .mockResolvedValue(new Response(null, { status: 204 }));
    render(fetcher, apiOrigin);
    act(() => props().onUrlChange("https://youtu.be/abcdefghijk"));
    await act(async () => props().onResolve());
    await vi.waitFor(() => expect(props().resolvedTitle).toBe("Reference"));
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      `${apiOrigin}/api/tools/youtube-audio/resolve`,
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    expect(transcodeProps?.externalSource).toMatchObject({
      downloadUrl: `${apiOrigin}/api/tools/youtube-audio/sources/${resolved.sourceId}?download=1`,
      input: {
        http: {
          url: `${apiOrigin}${relative.input.http.url}`,
          credentials: "include",
        },
      },
    });
    act(() => props().onClear());
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `${apiOrigin}${relative.input.http.url}`,
      expect.objectContaining({ credentials: "include", method: "DELETE" }),
    );
  });

  it("keeps API origins isolated between concurrently mounted tool instances", async () => {
    const relative = {
      ...resolved,
      input: {
        ...resolved.input,
        http: {
          ...resolved.input.http,
          url: `/api/tools/youtube-audio/sources/${resolved.sourceId}`,
        },
      },
    };
    const remoteFetch = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(JSON.stringify(relative)));
    const localFetch = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(JSON.stringify(relative)));
    act(() =>
      root.render(
        <IntlProvider locale="en" messages={enMessages}>
          <ToolRuntimeProvider
            config={{
              tool: "youtube-audio",
              parentOrigins: [],
              apiOrigin: "https://www.dsub.io",
            }}
          >
            <div data-instance="remote">
              <YoutubeAudioTool fetcher={remoteFetch} />
            </div>
          </ToolRuntimeProvider>
          <ToolRuntimeProvider
            config={{
              tool: "youtube-audio",
              parentOrigins: [],
              apiOrigin: window.location.origin,
            }}
          >
            <div data-instance="local">
              <YoutubeAudioTool fetcher={localFetch} />
            </div>
          </ToolRuntimeProvider>
        </IntlProvider>,
      ),
    );
    for (const name of ["remote", "local"]) {
      const instance = container.querySelector(`[data-instance="${name}"]`)!;
      act(() =>
        instance
          .querySelector<HTMLButtonElement>("[data-source-input]")!
          .click(),
      );
      await act(async () =>
        instance.querySelector<HTMLButtonElement>("[data-resolve]")!.click(),
      );
    }
    await vi.waitFor(() =>
      expect(
        container.querySelectorAll("[data-audio-transcoder]"),
      ).toHaveLength(2),
    );
    expect(remoteFetch).toHaveBeenCalledWith(
      "https://www.dsub.io/api/tools/youtube-audio/resolve",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(localFetch).toHaveBeenCalledWith(
      "/api/tools/youtube-audio/resolve",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(
      container
        .querySelector('[data-instance="remote"] [data-audio-transcoder]')
        ?.getAttribute("data-http-url"),
    ).toBe(`https://www.dsub.io${relative.input.http.url}`);
    expect(
      container
        .querySelector('[data-instance="local"] [data-audio-transcoder]')
        ?.getAttribute("data-http-url"),
    ).toBe(`${window.location.origin}${relative.input.http.url}`);
    expect(
      container
        .querySelector('[data-instance="remote"] [data-audio-transcoder]')
        ?.getAttribute("data-download-url"),
    ).toBe(`https://www.dsub.io${relative.input.http.url}?download=1`);
  });

  it("localizes missing authentication and keeps the converter closed", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
        status: 401,
      }),
    );
    render(fetcher);
    act(() => props().onUrlChange("https://youtu.be/abcdefghijk"));
    await act(async () => props().onResolve());
    await vi.waitFor(() =>
      expect(props().error).toBe(
        enMessages.tools.youtubeAudio.errors.UNAUTHORIZED,
      ),
    );
    expect(transcodeProps).toBeNull();
  });

  it("localizes server error codes without exposing upstream details", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "UNSUPPORTED_VIDEO" }), {
        status: 422,
      }),
    );
    render(fetcher);

    act(() => props().onUrlChange("https://youtu.be/abcdefghijk"));
    await act(async () => props().onResolve());
    await vi.waitFor(() =>
      expect(props().error).toContain("finite audio source"),
    );
    expect(transcodeProps).toBeNull();
  });

  it("revokes the exact source when the user clears it", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(resolved), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    render(fetcher);
    act(() => props().onUrlChange("https://youtu.be/abcdefghijk"));
    await act(async () => props().onResolve());
    await vi.waitFor(() => expect(props().resolvedTitle).toBe("Reference"));

    act(() => props().onClear());
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `/api/tools/youtube-audio/sources/${resolved.sourceId}`,
      expect.objectContaining({ keepalive: true, method: "DELETE" }),
    );
    expect(props().resolvedTitle).toBeNull();
    expect(props().url).toBe("");
  });
});
