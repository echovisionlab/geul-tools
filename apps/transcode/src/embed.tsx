import { AudioTranscodeTool } from "@/audio-client/AudioTranscodeTool";
import { createToolMount } from "@/shared/client/module";

export const mount = createToolMount({
  tool: "transcode",
  render: () => <AudioTranscodeTool initialFormat="mp3" />,
  cssUrl: new URL("./style.css", import.meta.url),
  configUrl: new URL("../runtime-config.json", import.meta.url),
});
