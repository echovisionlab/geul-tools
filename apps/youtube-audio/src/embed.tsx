import { YoutubeAudioTool } from "./YoutubeAudioTool";
import { createToolMount } from "@/shared/client/module";

export const mount = createToolMount({
  tool: "youtube-audio",
  render: () => <YoutubeAudioTool />,
  cssUrl: new URL("./style.css", import.meta.url),
  configUrl: new URL("../runtime-config.json", import.meta.url),
});
