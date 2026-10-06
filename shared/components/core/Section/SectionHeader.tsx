import type { ReactNode } from "react";
import { Group, Stack, Text } from "@mantine/core";

export interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function SectionHeader({
  title,
  description,
  actions,
}: SectionHeaderProps) {
  return (
    <Group justify="space-between" align="flex-start" wrap="wrap">
      <Stack gap={2} style={{ flex: "1 1 16rem", minWidth: 0 }}>
        <Text component="div" size="sm" fw={600}>
          {title}
        </Text>
        {description ? (
          <Text component="div" size="xs" c="dimmed">
            {description}
          </Text>
        ) : null}
      </Stack>
      {actions ? <div style={{ flexShrink: 0 }}>{actions}</div> : null}
    </Group>
  );
}
