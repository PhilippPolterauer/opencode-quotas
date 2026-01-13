import { type AnsiColor, type ProgressBarConfig, type GradientLevel } from "../interfaces";

const DEFAULT_BAR_WIDTH = 20;
const DEFAULT_FILLED_CHAR = "█";
const DEFAULT_EMPTY_CHAR = "░";

const DEFAULT_GRADIENTS: GradientLevel[] = [
    { threshold: 0.5, color: "green" },
    { threshold: 0.8, color: "yellow" },
    { threshold: 1.0, color: "red" },
];

const ANSI_CODES: Record<AnsiColor, string> = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
};

function shouldUseColor(config?: ProgressBarConfig): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.OPENCODE_QUOTAS_NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined) return true;
  
  // If not a TTY, generally disable color unless specifically forced by env
  if (!process.stdout.isTTY) return false;

  // Default to false unless enabled in config
  return config?.color === true;
}

export function colorize(text: string, color: AnsiColor | undefined, useColor: boolean): string {
  if (!useColor) return text;
  if (!color || color === "reset") return text;
  return `${ANSI_CODES[color]}${text}${ANSI_CODES.reset}`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) {
    return `${value}`;
  }
  if (Math.abs(value) >= 100) {
    return value.toFixed(1);
  }
  return value.toFixed(1);
}

export type RenderQuotaBarParts = {
  labelPart: string;
  bar: string;
  percent: string;
  valuePart: string;
  detailsPart: string;
  statusEmoji: string;
  statusText: string;
};

export function getQuotaStatusEmoji(
  ratio: number,
  config: ProgressBarConfig = {}
): string {
  // Default thresholds if not provided
  const gradients = config.gradients || DEFAULT_GRADIENTS;

  const sorted = [...gradients].sort((a, b) => a.threshold - b.threshold);
  
  // Find the matching level
  const match = sorted.find((g) => ratio <= g.threshold);
  const color = match ? match.color : sorted[sorted.length - 1]?.color || "red";

  switch (color) {
    case "green": return "🟢";
    case "yellow": return "🟡";
    case "red": return "🔴";
    default: return "⚪"; // Grey/Unknown
  }
}

export function getQuotaStatusText(
  ratio: number,
  config: ProgressBarConfig = {}
): string {
  // Default thresholds if not provided
  const gradients = config.gradients || DEFAULT_GRADIENTS;

  const sorted = [...gradients].sort((a, b) => a.threshold - b.threshold);
  
  // Find the matching level
  const match = sorted.find((g) => ratio <= g.threshold);
  const color = match ? match.color : sorted[sorted.length - 1]?.color || "red";

  switch (color) {
    case "green": return "OK "; // Space for alignment
    case "yellow": return "WRN";
    case "red": return "ERR";
    default: return "UNK";
  }
}

export function renderQuotaBarParts(
  used: number,
  limit: number,
  options: {
    label: string;
    unit: string;
    details?: string;
    config?: ProgressBarConfig;
  },
): RenderQuotaBarParts {
  const config = options.config || {};
  const width = config.width ?? DEFAULT_BAR_WIDTH;
  const filledChar = config.filledChar ?? DEFAULT_FILLED_CHAR;
  const emptyChar = config.emptyChar ?? DEFAULT_EMPTY_CHAR;
  const showMode = config.show ?? "used";
  const useColor = shouldUseColor(config);

  // Calculate value and ratio based on mode
  let displayValue = used;
  let ratio = 0;

  if (limit > 0) {
    if (showMode === "available") {
      displayValue = Math.max(0, limit - used);
    }
    ratio = displayValue / limit;
  }

  // Cap visual ratio at 1.0 for the bar filling, but keep actual ratio for color calculation if needed
  const visualRatio = Math.min(Math.max(ratio, 0), 1);

  const filledLen = Math.round(width * visualRatio);
  const emptyLen = Math.max(0, width - filledLen);

  // Determine Color
  let barColor: AnsiColor = "reset";
  let statusColor: AnsiColor = "reset";
  
  if (config.gradients && config.gradients.length > 0) {
    // Sort gradients by threshold to ensure correct evaluation
    const sorted = [...config.gradients].sort(
      (a, b) => a.threshold - b.threshold,
    );

    // Find the matching level
    const match = sorted.find((g) => ratio <= g.threshold);

    if (match) {
      barColor = match.color;
      statusColor = match.color;
    } else {
      // If ratio exceeds all thresholds (e.g. > 100%), use the last defined color (highest severity)
      barColor = sorted[sorted.length - 1].color;
      statusColor = sorted[sorted.length - 1].color;
    }
  }

  const filledStr = filledChar.repeat(filledLen);
  const emptyStr = emptyChar.repeat(emptyLen);

  const bar = `${colorize(filledStr, barColor, useColor)}${emptyStr}`; // Only color filled part? Or empty too? usually just filled.

  const percentRaw = limit > 0 ? `${Math.round(ratio * 100)}%` : "n/a";
  const percentText = percentRaw === "n/a" ? percentRaw : percentRaw.padStart(4);
  const percent = colorize(percentText, barColor, useColor);
  
  const valueText = `${formatNumber(displayValue)}/${formatNumber(limit)} ${options.unit}`;

  // Only append colon if label is present and not empty
  const labelPart = options.label ? `${options.label}: ` : "";

  // Determine Emoji
  const statusEmoji = getQuotaStatusEmoji(ratio, config);
  const statusTextRaw = getQuotaStatusText(ratio, config);
  const statusText = colorize(statusTextRaw, statusColor, useColor);

  return {
    labelPart,
    bar,
    percent,
    valuePart: `(${valueText})`,
    detailsPart: options.details ? ` | ${options.details}` : "",
    statusEmoji,
    statusText,
  };
}

