import { PortaDJTool } from "./PortaDJTool";
import { createToolMount } from "@/shared/client/module";

export const mount = createToolMount({
  tool: "portadj",
  render: () => <PortaDJTool />,
  cssUrl: new URL("./style.css", import.meta.url),
  configUrl: new URL("../runtime-config.json", import.meta.url),
});
