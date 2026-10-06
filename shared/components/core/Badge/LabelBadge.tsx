import type { ComponentPropsWithoutRef, ElementType } from "react";
import { Badge, type BadgeProps } from "@mantine/core";
import { getBadgeToneColor, type BadgeTone } from "./badge-tones";

export interface LabelBadgeProps
  extends
    Omit<BadgeProps, "color" | "radius" | "variant">,
    Omit<ComponentPropsWithoutRef<"div">, keyof BadgeProps> {
  tone?: BadgeTone;
  appearance?: BadgeAppearance;
  component?: ElementType;
}

export type BadgeAppearance = "soft" | "outline" | "solid" | "dot";

export function getBadgeVariant(appearance: BadgeAppearance) {
  switch (appearance) {
    case "outline":
      return "outline";
    case "solid":
      return "filled";
    case "dot":
      return "dot";
    case "soft":
    default:
      return "light";
  }
}

export function LabelBadge({
  tone = "neutral",
  appearance = "soft",
  size = "sm",
  ...props
}: LabelBadgeProps) {
  const MantineBadge = Badge as any;
  const badgeProps = props as BadgeProps & { component?: ElementType };
  return (
    <MantineBadge
      {...badgeProps}
      color={getBadgeToneColor(tone)}
      variant={getBadgeVariant(appearance)}
      radius="xs"
      size={size}
      data-tone={tone}
      data-appearance={appearance}
    />
  );
}
