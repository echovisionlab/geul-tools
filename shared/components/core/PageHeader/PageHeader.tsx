import type { ReactNode } from "react";
import { Group, Stack, Text } from "@mantine/core";

export type PageHeaderAlign = "start" | "center";
export type PageHeaderLevel = 1 | 2;

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  align?: PageHeaderAlign;
  level?: PageHeaderLevel;
}

/** Domain-free route heading with a stable visual scale independent from its semantic level. */
export function PageHeader({
  title,
  description,
  actions,
  align = "start",
  level = 1,
}: PageHeaderProps) {
  const heading = `h${level}` as "h1" | "h2";

  return (
    <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
      <Stack gap={4} ta={align} style={{ minWidth: 0, flex: 1 }}>
        <Text component={heading} fz="1.5rem" fw={700} lh={1.3} m={0}>
          {title}
        </Text>
        {description ? (
          <Text component="p" size="sm" c="dimmed" m={0}>
            {description}
          </Text>
        ) : null}
      </Stack>
      {actions ? <Group gap="xs">{actions}</Group> : null}
    </Group>
  );
}
