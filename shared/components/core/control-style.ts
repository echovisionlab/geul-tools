export type ControlTone =
  "accent" | "neutral" | "positive" | "warning" | "danger";

export type ControlEmphasis = "strong" | "medium" | "low" | "outline";

type ControlVariant = "filled" | "light" | "subtle" | "outline" | "default";

const toneColors: Record<ControlTone, string> = {
  accent: "blue",
  neutral: "gray",
  positive: "teal",
  warning: "yellow",
  danger: "red",
};

export function getControlToneColor(tone: ControlTone) {
  return toneColors[tone];
}

export function resolveControlStyle(
  tone: ControlTone,
  emphasis: ControlEmphasis,
): { color: string | undefined; variant: ControlVariant } {
  if (emphasis === "low") {
    return { color: toneColors[tone], variant: "subtle" };
  }

  if (emphasis === "outline") {
    return {
      color: tone === "neutral" ? undefined : toneColors[tone],
      variant: tone === "neutral" ? "default" : "outline",
    };
  }

  if (emphasis === "medium") {
    return {
      color: tone === "neutral" ? undefined : toneColors[tone],
      variant: tone === "neutral" ? "default" : "light",
    };
  }

  return { color: toneColors[tone], variant: "filled" };
}
