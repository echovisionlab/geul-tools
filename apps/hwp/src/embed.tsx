import { HwpEditorTool } from "./HwpEditorTool";
import { createToolMount } from "@/shared/client/module";

export const mount = createToolMount({
  tool: "hwp",
  render: () => <HwpEditorTool />,
  cssUrl: new URL("./style.css", import.meta.url),
  configUrl: new URL("../runtime-config.json", import.meta.url),
});
