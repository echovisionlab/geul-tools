import { AudioTranscodeTool } from "@/audio-client/AudioTranscodeTool";
import { mountTool } from "@/shared/client";

mountTool({
  tool: "transcode",
  render: () => <AudioTranscodeTool initialFormat="mp3" />,
});
