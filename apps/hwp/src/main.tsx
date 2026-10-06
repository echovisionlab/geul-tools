import { mountTool } from "@/shared/client";
import { HwpEditorTool } from "./HwpEditorTool";

mountTool({ tool: "hwp", render: () => <HwpEditorTool /> });
