import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementType,
} from "react";
import {
  Badge,
  createPolymorphicComponent,
  type BadgeProps,
} from "@mantine/core";
import { getBadgeToneColor, type BadgeTone } from "./badge-tones";
import { getBadgeVariant, type BadgeAppearance } from "./LabelBadge";

export type StatusBadgeTone = BadgeTone;

export interface StatusBadgeProps
  extends
    Omit<BadgeProps, "color" | "radius" | "variant">,
    Omit<ComponentPropsWithoutRef<"div">, keyof BadgeProps> {
  tone?: StatusBadgeTone;
  appearance?: BadgeAppearance;
  component?: ElementType;
}

type StatusBadgeBaseProps = Omit<StatusBadgeProps, "component">;

function StatusBadgeInner(
  {
    tone = "neutral",
    appearance = "soft",
    size = "sm",
    ...props
  }: StatusBadgeBaseProps,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  return (
    <Badge
      ref={ref}
      {...props}
      color={getBadgeToneColor(tone)}
      variant={getBadgeVariant(appearance)}
      radius="xs"
      size={size}
      data-tone={tone}
      data-appearance={appearance}
    />
  );
}

const StatusBadgeBase = forwardRef<HTMLDivElement, StatusBadgeBaseProps>(
  StatusBadgeInner,
);
StatusBadgeBase.displayName = "StatusBadge";

export const StatusBadge = createPolymorphicComponent<
  "div",
  StatusBadgeBaseProps
>(StatusBadgeBase);
