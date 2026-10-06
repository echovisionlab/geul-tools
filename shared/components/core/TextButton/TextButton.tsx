import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ElementType,
  type ForwardedRef,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
  type RefAttributes,
} from "react";
type NextLinkProps = { href: string };
const Link = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<"a">>(
  (props, ref) => <a {...props} ref={ref} />,
);
import classes from "./TextButton.module.css";

export type TextButtonAppearance = "default" | "muted" | "accent";
export type TextButtonSize = "xs" | "sm" | "md";
export type TextButtonControlSize = "xs" | "sm" | "md";
export type TextButtonWeight = "regular" | "medium" | "semibold";
export type TextButtonDisplay = "inline" | "inline-flex" | "flex" | "block";

export interface TextButtonCssVariables {
  "--text-button-color"?: CSSProperties["color"];
  "--text-button-hover-color"?: CSSProperties["color"];
  "--text-button-font-size"?: CSSProperties["fontSize"];
  "--text-button-font-weight"?: CSSProperties["fontWeight"];
  "--text-button-line-height"?: CSSProperties["lineHeight"];
  "--text-button-min-height"?: CSSProperties["minHeight"];
  "--text-button-padding-block"?: CSSProperties["paddingBlock"];
  "--text-button-padding-inline"?: CSSProperties["paddingInline"];
  "--text-button-width"?: CSSProperties["width"];
  "--text-button-max-width"?: CSSProperties["maxWidth"];
}

export type TextButtonStyle = CSSProperties & TextButtonCssVariables;

interface TextButtonSharedProps {
  children: ReactNode;
  appearance?: TextButtonAppearance;
  size?: TextButtonSize;
  controlSize?: TextButtonControlSize;
  weight?: TextButtonWeight;
  display?: TextButtonDisplay;
  fullWidth?: boolean;
  nowrap?: boolean;
  className?: string;
  style?: TextButtonStyle;
}

export type TextButtonButtonProps = TextButtonSharedProps &
  Omit<
    ComponentPropsWithoutRef<"button">,
    keyof TextButtonSharedProps | "color" | "onClick"
  > & {
    href?: never;
    linkComponent?: never;
    onClick?: MouseEventHandler<HTMLButtonElement>;
    onNavigate?: never;
    target?: never;
    rel?: never;
    download?: never;
  };

export type TextButtonLinkProps = TextButtonSharedProps &
  Omit<
    ComponentPropsWithoutRef<typeof Link>,
    | keyof TextButtonSharedProps
    | "color"
    | "disabled"
    | "href"
    | "linkComponent"
    | "legacyBehavior"
    | "onNavigate"
    | "passHref"
    | "type"
  > & {
    href: NextLinkProps["href"];
    linkComponent?: ElementType;
    disabled?: never;
    onClick?: never;
    onNavigate?: (href: NextLinkProps["href"]) => void;
    type?: never;
  };

export type TextButtonProps = TextButtonButtonProps | TextButtonLinkProps;

type TextButtonComponent = {
  (
    props: TextButtonButtonProps & RefAttributes<HTMLButtonElement>,
  ): ReactElement | null;
  (
    props: TextButtonLinkProps & RefAttributes<HTMLAnchorElement>,
  ): ReactElement | null;
};

function TextButtonInner(
  props: TextButtonProps,
  ref: ForwardedRef<HTMLButtonElement | HTMLAnchorElement>,
) {
  const {
    href,
    linkComponent: LinkComponent = Link,
    onNavigate,
    appearance = "default",
    size = "sm",
    controlSize,
    weight = "regular",
    display = "inline-flex",
    fullWidth = false,
    nowrap = false,
    className,
    style,
    ...elementProps
  } = props;
  const rootClassName = [classes.root, className].filter(Boolean).join(" ");
  const visualProps = {
    className: rootClassName,
    style,
    "data-appearance": appearance,
    "data-size": size,
    "data-control-size": controlSize,
    "data-weight": weight,
    "data-display": display,
    "data-full-width": fullWidth || undefined,
    "data-nowrap": nowrap || undefined,
  };

  if (href !== undefined) {
    const navigationProps = onNavigate
      ? { onClick: () => onNavigate(href) }
      : {};

    return (
      <LinkComponent
        {...(elementProps as Omit<
          TextButtonLinkProps,
          keyof TextButtonSharedProps | "href" | "linkComponent"
        >)}
        {...visualProps}
        ref={ref as ForwardedRef<HTMLAnchorElement>}
        href={href}
        {...navigationProps}
      />
    );
  }

  const { type = "button", ...buttonProps } = elementProps as Omit<
    TextButtonButtonProps,
    keyof TextButtonSharedProps | "href"
  >;

  // `type` is constrained by native button props and defaults to "button" above.
  return (
    <button
      {...buttonProps}
      {...visualProps}
      ref={ref as ForwardedRef<HTMLButtonElement>}
      type={type}
    />
  );
}

const TextButtonBase = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  TextButtonProps
>(TextButtonInner);
TextButtonBase.displayName = "TextButton";

export const TextButton = TextButtonBase as TextButtonComponent;
