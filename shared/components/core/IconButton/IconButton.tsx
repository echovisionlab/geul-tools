import { forwardRef } from "react";
import {
  ActionIcon,
  createPolymorphicComponent,
  type ActionIconProps,
  type MantineSize,
} from "@mantine/core";
import {
  resolveControlStyle,
  type ControlEmphasis,
  type ControlTone,
} from "../control-style";
import classes from "./IconButton.module.css";

// ActionIcon's named sizes differ from Button's. Use controlSize in mixed action rows.
const BUTTON_CONTROL_HEIGHTS: Record<MantineSize, string> = {
  xs: "1.875rem",
  sm: "2.25rem",
  md: "2.625rem",
  lg: "3.125rem",
  xl: "3.75rem",
};

export type IconButtonAccessibleName =
  | { label: string; "aria-label"?: never; "aria-labelledby"?: never }
  | { label?: never; "aria-label": string; "aria-labelledby"?: never }
  | { label?: never; "aria-label"?: never; "aria-labelledby": string };

export type IconButtonProps = Omit<
  ActionIconProps,
  "aria-label" | "aria-labelledby" | "color" | "radius" | "variant"
> &
  IconButtonAccessibleName & {
    tone?: ControlTone;
    emphasis?: ControlEmphasis;
    shape?: "square" | "circle";
    /** Match the height of a Core Button with the same size; overrides standalone size. */
    controlSize?: MantineSize;
  };

function IconButtonInner(
  {
    tone = "neutral",
    emphasis = "low",
    shape = "square",
    label,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    className,
    controlSize,
    size,
    ...props
  }: IconButtonProps,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  const style = resolveControlStyle(tone, emphasis);

  return (
    <ActionIcon
      ref={ref}
      {...props}
      size={
        controlSize
          ? `calc(${BUTTON_CONTROL_HEIGHTS[controlSize]} * var(--mantine-scale))`
          : size
      }
      color={style.color}
      variant={style.variant}
      radius={shape === "circle" ? "xl" : 0}
      aria-label={ariaLabel ?? label}
      aria-labelledby={ariaLabelledBy}
      data-tone={tone}
      data-emphasis={emphasis}
      data-shape={shape}
      data-control-size={controlSize}
      className={[classes.root, className].filter(Boolean).join(" ")}
    />
  );
}

const IconButtonBase = forwardRef<HTMLButtonElement, IconButtonProps>(
  IconButtonInner,
);
IconButtonBase.displayName = "IconButton";

export const IconButton = createPolymorphicComponent<"button", IconButtonProps>(
  IconButtonBase,
);
