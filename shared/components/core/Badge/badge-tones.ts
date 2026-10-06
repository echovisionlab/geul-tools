import { getControlToneColor, type ControlTone } from "../control-style";

export type BadgeTone = ControlTone;
export type StatusTone = ControlTone;

export function getBadgeToneColor(tone: BadgeTone) {
  return getControlToneColor(tone);
}

export function badgeToneFromColor(color?: string | null): BadgeTone {
  switch (color) {
    case "blue":
    case "cyan":
    case "violet":
    case "grape":
      return "accent";
    case "green":
    case "teal":
      return "positive";
    case "yellow":
    case "orange":
      return "warning";
    case "red":
      return "danger";
    case "gray":
    case "dark":
    default:
      return "neutral";
  }
}

export function statusToneFromColor(color?: string | null): StatusTone {
  return badgeToneFromColor(color);
}
