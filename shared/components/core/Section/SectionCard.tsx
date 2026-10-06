import { forwardRef } from "react";
import {
  Card,
  createPolymorphicComponent,
  type CardProps as MantineCardProps,
} from "@mantine/core";

export interface SectionCardProps extends MantineCardProps {}

function SectionCardInner(
  { withBorder = true, p = "md", ...props }: SectionCardProps,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  return <Card ref={ref} withBorder={withBorder} p={p} {...props} />;
}

const SectionCardBase = forwardRef<HTMLDivElement, SectionCardProps>(
  SectionCardInner,
);

SectionCardBase.displayName = "SectionCard";

export const SectionCard = createPolymorphicComponent<"div", SectionCardProps>(
  SectionCardBase,
);
