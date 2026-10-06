import { mountTool } from "@/shared/client";
import { PortaDJTool } from "./PortaDJTool";

mountTool({ tool: "portadj", render: () => <PortaDJTool /> });
