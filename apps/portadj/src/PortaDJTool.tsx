import { PortaDJ } from "@dsub/portadj/react";
import { useComputedColorScheme } from "@mantine/core";

export function PortaDJTool() {
  const theme = useComputedColorScheme("light");

  return <PortaDJ theme={theme} />;
}
