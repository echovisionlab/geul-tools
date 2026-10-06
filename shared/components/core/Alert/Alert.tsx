import { forwardRef } from "react";
import {
  Alert as MantineAlert,
  type AlertProps as MantineAlertProps,
} from "@mantine/core";
import { getControlToneColor, type ControlTone } from "../control-style";

export type AlertTone = ControlTone;
export type AlertProminence = "standard" | "strong";

export interface AlertProps extends Omit<
  MantineAlertProps,
  "autoContrast" | "color" | "radius" | "variant"
> {
  tone?: AlertTone;
  prominence?: AlertProminence;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ tone = "accent", prominence = "standard", ...props }, ref) => (
    <MantineAlert
      ref={ref}
      {...props}
      color={getControlToneColor(tone)}
      variant={prominence === "strong" ? "filled" : "light"}
      radius={0}
      autoContrast={prominence === "strong"}
      data-tone={tone}
      data-prominence={prominence}
    />
  ),
);

Alert.displayName = "Alert";
