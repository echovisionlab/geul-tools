import { forwardRef } from "react";
import {
  createPolymorphicComponent,
  Button as MantineButton,
  type ButtonProps as MantineButtonProps,
} from "@mantine/core";
import {
  resolveControlStyle,
  type ControlEmphasis,
  type ControlTone,
} from "../control-style";

export interface ButtonProps extends Omit<
  MantineButtonProps,
  "color" | "radius" | "variant"
> {
  tone?: ControlTone;
  emphasis?: ControlEmphasis;
}

function ButtonInner(
  { tone = "accent", emphasis = "strong", ...props }: ButtonProps,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  const style = resolveControlStyle(tone, emphasis);

  return (
    <MantineButton
      ref={ref}
      {...props}
      color={style.color}
      variant={style.variant}
      radius={0}
      data-tone={tone}
      data-emphasis={emphasis}
    />
  );
}

const ButtonBase = forwardRef<HTMLButtonElement, ButtonProps>(ButtonInner);
ButtonBase.displayName = "Button";

export const Button = createPolymorphicComponent<"button", ButtonProps>(
  ButtonBase,
);
