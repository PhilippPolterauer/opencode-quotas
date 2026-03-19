import { PLUGIN_FOOTER_SIGNATURE } from "../constants";

export function renderQuotaFooter(
    lines: string[],
    options: {
        mode: "used" | "available";
        showTitle?: boolean;
    },
): string {
    const modeLabel = options.mode === "available" ? "(Remaining)" : "(Used)";
    const title = options.showTitle !== false
        ? `**${PLUGIN_FOOTER_SIGNATURE} ${modeLabel}**\n\n`
        : "";

    return `\n\n${title}\`\`\`text\n${lines.join("\n")}\n\`\`\``;
}
