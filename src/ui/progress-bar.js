import { isValidNumber } from "../utils/validation";
const DEFAULT_BAR_WIDTH = 20;
const DEFAULT_FILLED_CHAR = "█";
const DEFAULT_EMPTY_CHAR = "░";
const DEFAULT_GRADIENTS = [
    { threshold: 0.5, color: "green" },
    { threshold: 0.8, color: "yellow" },
    { threshold: 1.0, color: "red" },
];
const ANSI_CODES = {
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
function shouldUseColor(config) {
    // FORCE_COLOR should take precedence when explicitly set
    if (process.env.FORCE_COLOR !== undefined)
        return true;
    // Respect explicit no-color flags
    if (process.env.NO_COLOR !== undefined)
        return false;
    if (process.env.OPENCODE_QUOTAS_NO_COLOR !== undefined)
        return false;
    // Respect explicit config request (useful for tests/environments)
    if (config?.color === true)
        return true;
    // If not a TTY, generally disable color
    if (!process.stdout.isTTY)
        return false;
    return true;
}
export function colorize(text, color, useColor) {
    if (!useColor)
        return text;
    if (!color || color === "reset")
        return text;
    return `${ANSI_CODES[color]}${text}${ANSI_CODES.reset}`;
}
function formatNumber(value) {
    if (!Number.isFinite(value))
        return "0";
    if (Number.isInteger(value)) {
        return `${value}`;
    }
    if (Math.abs(value) >= 100) {
        return value.toFixed(1);
    }
    return value.toFixed(1);
}
export function getQuotaStatusEmoji(ratio, config = {}) {
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
export function getQuotaStatusText(ratio, config = {}) {
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
export function renderQuotaBarParts(used, limit, options) {
    const config = options.config || {};
    const width = config.width ?? DEFAULT_BAR_WIDTH;
    const filledChar = config.filledChar ?? DEFAULT_FILLED_CHAR;
    const emptyChar = config.emptyChar ?? DEFAULT_EMPTY_CHAR;
    const showMode = config.show ?? "used";
    const useColor = shouldUseColor(config);
    // Defensive guards: normalize inputs
    const usedVal = isValidNumber(used) ? Math.max(0, used) : 0;
    const limitVal = isValidNumber(limit) && limit > 0 ? limit : 0;
    // Calculate value and ratio based on mode
    let displayValue = usedVal;
    let ratio = 0;
    if (limitVal > 0) {
        if (showMode === "available") {
            displayValue = Math.max(0, limitVal - usedVal);
        }
        ratio = displayValue / limitVal;
    }
    // Cap visual ratio at 1.0 for the bar filling, but keep actual ratio for color calculation if needed
    const visualRatio = Math.min(Math.max(ratio, 0), 1);
    const filledLen = Math.round(width * visualRatio);
    const emptyLen = Math.max(0, width - filledLen);
    // Determine Color
    let barColor = "reset";
    let statusColor = "reset";
    if (config.gradients && config.gradients.length > 0) {
        // Sort gradients by threshold to ensure correct evaluation
        const sorted = [...config.gradients].sort((a, b) => a.threshold - b.threshold);
        // Find the matching level
        const match = sorted.find((g) => ratio <= g.threshold);
        if (match) {
            barColor = match.color;
            statusColor = match.color;
        }
        else {
            // If ratio exceeds all thresholds (e.g. > 100%), use the last defined color (highest severity)
            barColor = sorted[sorted.length - 1].color;
            statusColor = sorted[sorted.length - 1].color;
        }
    }
    const filledStr = filledChar.repeat(filledLen);
    const emptyStr = emptyChar.repeat(emptyLen);
    const bar = `${colorize(filledStr, barColor, useColor)}${emptyStr}`; // Only color filled part? Or empty too? usually just filled.
    const percentRaw = limitVal > 0 ? `${Math.round(ratio * 100)}%` : "n/a";
    const percentText = percentRaw === "n/a" ? percentRaw : percentRaw.padStart(4);
    const percent = colorize(percentText, barColor, useColor);
    const valueText = `${formatNumber(displayValue)}/${formatNumber(limitVal)} ${options.unit}`;
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
