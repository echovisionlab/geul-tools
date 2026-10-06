import { useMemo } from "react";
import classes from "./Input.module.css";

type ClassNamesObject = Record<string, string | undefined>;

export function useCoreInputClassNames<TClassNames>(
  classNames: TClassNames | undefined,
  animate: boolean,
): TClassNames {
  return useMemo(() => {
    if (typeof classNames === "function") {
      return classNames;
    }

    const values = (classNames ?? {}) as ClassNamesObject;
    return {
      ...values,
      wrapper: [animate ? classes.wrapper : undefined, values.wrapper]
        .filter(Boolean)
        .join(" "),
      input: [classes.input, values.input].filter(Boolean).join(" "),
    } as TClassNames;
  }, [animate, classNames]);
}
