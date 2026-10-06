import { forwardRef } from "react";
import {
  NativeSelect as MantineNativeSelect,
  type NativeSelectProps as MantineNativeSelectProps,
} from "@mantine/core";
import { useCoreInputClassNames } from "./useCoreInputClassNames";

export interface NativeSelectProps extends MantineNativeSelectProps {
  animate?: boolean;
}

export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ animate = true, classNames, ...props }, ref) => {
    const mergedClassNames = useCoreInputClassNames(classNames, animate);

    return (
      <MantineNativeSelect ref={ref} classNames={mergedClassNames} {...props} />
    );
  },
);

NativeSelect.displayName = "NativeSelect";
