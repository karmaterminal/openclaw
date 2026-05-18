import chalk, { Chalk, type ChalkInstance } from "chalk";
import { LOBSTER_PALETTE } from "./palette.js";

type ThemeColor = ((text: string) => string) & {
  bold: (text: string) => string;
};

function hasForceColor(): boolean {
  return (
    typeof process.env.FORCE_COLOR === "string" &&
    process.env.FORCE_COLOR.trim().length > 0 &&
    process.env.FORCE_COLOR.trim() !== "0"
  );
}

function resolveBaseChalk(): ChalkInstance {
  if (hasForceColor()) {
    return new Chalk({ level: 1 });
  }
  return process.env.NO_COLOR ? new Chalk({ level: 0 }) : chalk;
}

function hex(value: string): ThemeColor {
  const color = ((text: string) => resolveBaseChalk().hex(value)(text)) as ThemeColor;
  color.bold = (text: string) => resolveBaseChalk().bold.hex(value)(text);
  return color;
}

export const theme = {
  accent: hex(LOBSTER_PALETTE.accent),
  accentBright: hex(LOBSTER_PALETTE.accentBright),
  accentDim: hex(LOBSTER_PALETTE.accentDim),
  info: hex(LOBSTER_PALETTE.info),
  success: hex(LOBSTER_PALETTE.success),
  warn: hex(LOBSTER_PALETTE.warn),
  error: hex(LOBSTER_PALETTE.error),
  muted: hex(LOBSTER_PALETTE.muted),
  heading: (text: string) => resolveBaseChalk().bold.hex(LOBSTER_PALETTE.accent)(text),
  command: hex(LOBSTER_PALETTE.accentBright),
  option: hex(LOBSTER_PALETTE.warn),
} as const;

export const isRich = () => resolveBaseChalk().level > 0;

export const colorize = (rich: boolean, color: (value: string) => string, value: string) =>
  rich ? color(value) : value;
