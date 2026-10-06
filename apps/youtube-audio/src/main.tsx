import { mountTool } from "@/shared/client";
import { YoutubeAudioTool } from "./YoutubeAudioTool";

mountTool({ tool: "youtube-audio", render: () => <YoutubeAudioTool /> });
