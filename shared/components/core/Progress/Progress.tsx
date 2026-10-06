import { forwardRef } from "react";
import {
  Progress as MantineProgress,
  type ProgressRootProps as MantineProgressRootProps,
} from "@mantine/core";
import { getControlToneColor, type ControlTone } from "../control-style";

export interface ProgressProps extends Omit<
  MantineProgressRootProps,
  "aria-valuemax" | "aria-valuemin" | "aria-valuenow" | "radius" | "role"
> {
  /** Null renders an indeterminate progress bar without aria-valuenow. */
  value: number | null;
  tone?: ControlTone;
  striped?: boolean;
  animated?: boolean;
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  (
    {
      value,
      tone = "accent",
      size = "sm",
      striped,
      animated,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      "aria-describedby": ariaDescribedBy,
      "aria-valuetext": ariaValueText,
      ...props
    },
    ref,
  ) => (
    <MantineProgress.Root
      ref={ref}
      {...props}
      radius={0}
      size={size}
      data-tone={tone}
    >
      <MantineProgress.Section
        value={value ?? 100}
        color={getControlToneColor(tone)}
        striped={striped || value === null}
        animated={animated || value === null}
        withAria={false}
        role="progressbar"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
        aria-valuetext={
          ariaValueText ?? (value === null ? undefined : `${value}%`)
        }
        data-tone={tone}
      />
    </MantineProgress.Root>
  ),
);

Progress.displayName = "Progress";
