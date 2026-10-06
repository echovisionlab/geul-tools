import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { Group, Stack, Text } from "@mantine/core";

export interface FieldProps {
  label: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  required?: boolean;
  htmlFor?: string;
}

function mergeDescribedBy(...values: Array<string | undefined>) {
  const tokens = values
    .flatMap((value) => value?.split(/\s+/).filter(Boolean) ?? [])
    .filter(Boolean);

  return tokens.length > 0 ? Array.from(new Set(tokens)).join(" ") : undefined;
}

const srOnlyStyles = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

export function Field({
  label,
  description,
  actions,
  error,
  children,
  required = false,
  htmlFor,
}: FieldProps) {
  const onlyChild =
    Children.count(children) === 1 ? Children.only(children) : null;
  const childId =
    htmlFor ||
    (isValidElement(onlyChild) && typeof onlyChild.props === "object"
      ? (onlyChild.props as { id?: string }).id
      : undefined);
  const descriptionId =
    description && childId ? `${childId}-description` : undefined;
  const errorId = error && childId ? `${childId}-error` : undefined;

  let resolvedChildren = children;
  if (isValidElement(onlyChild)) {
    const child = onlyChild as ReactElement<Record<string, unknown>>;
    const childProps = child.props ?? {};
    const mergedDescribedBy = mergeDescribedBy(
      typeof childProps["aria-describedby"] === "string"
        ? (childProps["aria-describedby"] as string)
        : undefined,
      descriptionId,
      errorId,
    );
    const nextProps: Record<string, unknown> = {
      ...(childId && !childProps.id ? { id: childId } : {}),
      ...(error ? { "aria-invalid": true } : {}),
      ...(mergedDescribedBy ? { "aria-describedby": mergedDescribedBy } : {}),
    };

    if (typeof child.type !== "string") {
      const hiddenDescription =
        description && !childProps.description ? (
          <span>{description}</span>
        ) : (
          childProps.description
        );
      const hiddenError =
        error && !childProps.error ? <span>{error}</span> : childProps.error;
      if (hiddenDescription) {
        nextProps.description = hiddenDescription;
        nextProps.descriptionProps = {
          ...(typeof childProps.descriptionProps === "object"
            ? childProps.descriptionProps
            : {}),
          ...(descriptionId ? { id: descriptionId } : {}),
          style: {
            ...(typeof childProps.descriptionProps === "object" &&
            childProps.descriptionProps &&
            "style" in childProps.descriptionProps &&
            typeof childProps.descriptionProps.style === "object"
              ? (childProps.descriptionProps.style as Record<string, unknown>)
              : {}),
            ...srOnlyStyles,
          },
        };
      }

      if (hiddenError) {
        nextProps.error = hiddenError;
        nextProps.errorProps = {
          ...(typeof childProps.errorProps === "object"
            ? childProps.errorProps
            : {}),
          ...(errorId ? { id: errorId } : {}),
          style: {
            ...(typeof childProps.errorProps === "object" &&
            childProps.errorProps &&
            "style" in childProps.errorProps &&
            typeof childProps.errorProps.style === "object"
              ? (childProps.errorProps.style as Record<string, unknown>)
              : {}),
            ...srOnlyStyles,
          },
        };
      }

      nextProps.inputWrapperOrder = [
        "input",
        ...(hiddenDescription ? (["description"] as const) : []),
        ...(hiddenError ? (["error"] as const) : []),
      ];
    }

    resolvedChildren = cloneElement(child, nextProps);
  }

  return (
    <Stack gap={6}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
          <Text
            component={childId ? "label" : "div"}
            htmlFor={childId}
            size="sm"
            fw={500}
          >
            {label}
            {required ? (
              <Text component="span" c="red" inherit>
                {" "}
                *
              </Text>
            ) : null}
          </Text>
          {description ? (
            <Text component="div" size="xs" c="dimmed">
              {description}
            </Text>
          ) : null}
        </Stack>
        {actions}
      </Group>
      {resolvedChildren}
      {error ? (
        <Text component="div" size="xs" c="red">
          {error}
        </Text>
      ) : null}
    </Stack>
  );
}
