import { forwardRef } from "react";
import {
  TextInput as MantineTextInput,
  type TextInputProps as MantineTextInputProps,
} from "@mantine/core";
import { useCoreInputClassNames } from "./useCoreInputClassNames";

export interface TextInputProps extends MantineTextInputProps {
  animate?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ animate = true, classNames, ...props }, ref) => {
    const mergedClassNames = useCoreInputClassNames(classNames, animate);

    return (
      <MantineTextInput ref={ref} classNames={mergedClassNames} {...props} />
    );
  },
);

TextInput.displayName = "TextInput";
