"use client";

import { forwardRef, type ReactNode } from "react";
import { Accordion as MantineAccordion } from "@mantine/core";
import classes from "./Disclosure.module.css";

export type DisclosureAppearance = "plain" | "filled";
export type DisclosureDensity = "standard" | "compact";
export type DisclosureShape = "square" | "rounded";
export type DisclosureContentIndent = "none" | "small";

export interface DisclosureProps {
  label: ReactNode;
  children?: ReactNode;
  opened?: boolean;
  defaultOpened?: boolean;
  onChange?: (opened: boolean) => void;
  appearance?: DisclosureAppearance;
  density?: DisclosureDensity;
  shape?: DisclosureShape;
  contentIndent?: DisclosureContentIndent;
  disabled?: boolean;
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  keepMounted?: boolean;
  id?: string;
  className?: string;
}

const DISCLOSURE_VALUE = "content";

const APPEARANCE_VARIANTS = {
  plain: "default",
  filled: "filled",
} as const;

export const Disclosure = forwardRef<HTMLDivElement, DisclosureProps>(
  (
    {
      label,
      children,
      opened,
      defaultOpened = false,
      onChange,
      appearance = "plain",
      density = "standard",
      shape = "rounded",
      contentIndent = "none",
      disabled = false,
      headingLevel,
      keepMounted = true,
      className,
      ...props
    },
    ref,
  ) => (
    <MantineAccordion
      ref={ref}
      {...props}
      className={`${classes.root} ${className ?? ""}`.trim()}
      classNames={{
        item: classes.item,
        control: classes.control,
        label: classes.label,
        chevron: classes.chevron,
        content: classes.content,
      }}
      value={
        opened === undefined ? undefined : opened ? DISCLOSURE_VALUE : null
      }
      defaultValue={defaultOpened ? DISCLOSURE_VALUE : null}
      onChange={(value) => onChange?.(value === DISCLOSURE_VALUE)}
      variant={APPEARANCE_VARIANTS[appearance]}
      radius={shape === "square" ? 0 : "sm"}
      chevronPosition="right"
      order={headingLevel}
      keepMounted={keepMounted}
      data-appearance={appearance}
      data-density={density}
      data-shape={shape}
      data-content-indent={contentIndent}
      data-disclosure
    >
      <MantineAccordion.Item value={DISCLOSURE_VALUE}>
        <MantineAccordion.Control disabled={disabled}>
          {label}
        </MantineAccordion.Control>
        <MantineAccordion.Panel>{children}</MantineAccordion.Panel>
      </MantineAccordion.Item>
    </MantineAccordion>
  ),
);

Disclosure.displayName = "Disclosure";
