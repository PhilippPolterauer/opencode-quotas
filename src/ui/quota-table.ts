import { renderQuotaBarParts, type RenderQuotaBarParts, colorize } from "./progress-bar";
import { type ProgressBarConfig, type QuotaData, type QuotaColumn } from "../interfaces";

type RenderedQuotaLine = {
    id: string;
    providerName: string;
    line: string;
};

const DEFAULT_COLUMNS: QuotaColumn[] = ["status", "name", "percent", "bar", "reset", "ettl"];
const HEADERS: Record<QuotaColumn, string> = {
    name: "QUOTA NAME",
    bar: "UTILIZATION",
    percent: "USED",
    value: "VALUE",
    reset: "RESET",
    ettl: "ETTL",
    window: "WINDOW",
    info: "INFO",
    status: "ST"
};

export function renderQuotaTable(
    quotas: QuotaData[],
    options: {
        progressBarConfig?: ProgressBarConfig;
        tableConfig?: { columns?: QuotaColumn[] };
    },
): RenderedQuotaLine[] {
    if (quotas.length === 0) return [];

    const columns = options.tableConfig?.columns || DEFAULT_COLUMNS;
    const useColor = options.progressBarConfig?.color ?? false;

    // 1. Pre-calculate cell data for every row
    const rows = quotas.map((quota) => {
        const isUnlimited = quota.limit === null || quota.limit <= 0;
        
        // Render bar parts if limited
        let barParts: RenderQuotaBarParts | null = null;
        if (!isUnlimited) {
            barParts = renderQuotaBarParts(quota.used, quota.limit!, {
                label: "",
                unit: quota.unit,
                config: options.progressBarConfig,
            });
        }

        const name = colorize(quota.providerName, "cyan", useColor);
        const status = barParts 
            ? barParts.statusText 
            : (quota.info === "unlimited" ? colorize("OK ", "green", useColor) : colorize("UNK", "gray", useColor));
        
        // Strip "resets in " or "resets at " prefix for cleaner table display
        const resetRaw = quota.reset?.replace(/^resets (in|at) /, "") || "";
        const reset = colorize(resetRaw, "gray", useColor);
        
        const ettl = colorize(quota.predictedReset?.replace(/\(predicted\)/, "").trim() || "-", "gray", useColor);

        return {
            quota,
            barParts,
            cells: {
                name,
                bar: barParts ? barParts.bar : (isUnlimited ? colorize("Unlimited", "green", useColor) : ""),
                percent: barParts ? barParts.percent : "",
                value: barParts ? barParts.valuePart : `${quota.used} ${quota.unit}`,
                reset,
                ettl,
                window: quota.window || "",
                info: quota.info || "",
                status,
            } as Record<QuotaColumn, string>
        };
    });

    // 2. Measure widths
    const widths: Record<QuotaColumn, number> = {
        name: 0, bar: 0, percent: 0, value: 0, reset: 0, window: 0, info: 0, status: 0, ettl: 0
    };

    // Calculate max widths including headers
    for (const col of columns) {
        widths[col] = Math.max(widths[col], HEADERS[col].length);
    }

    for (const row of rows) {
        for (const col of columns) {
            const content = row.cells[col];
            const visibleLength = content.replace(/\x1b\[[0-9;]*m/g, "").length;
            if (visibleLength > widths[col]) {
                widths[col] = visibleLength;
            }
        }
    }

    const outputRows: RenderedQuotaLine[] = [];

    // 3. Render Header
    const headerSegments: string[] = [];
    const separatorSegments: string[] = [];

    for (const col of columns) {
        const width = widths[col];
        const headerTitle = HEADERS[col];
        // Alignments: same as content
        // percent: right
        // others: left
        
        const coloredHeader = colorize(headerTitle, "bold", useColor);
        let segment = "";
        let sep = "";
        
        // When padding, we need to consider visible length of the colored string vs stripped
        // But here `headerTitle` is uncolored when calculating padding, so standard pad works
        // provided we apply color AFTER padding, OR pad properly.
        // Actually, padStart/padEnd on the uncolored string, THEN colorize.
        
        let paddedTitle = "";
        if (col === "percent") {
            paddedTitle = headerTitle.padStart(width);
        } else {
            paddedTitle = headerTitle.padEnd(width);
        }
        segment = colorize(paddedTitle, "bold", useColor);
        
        const sepChar = "─"; // Use for all
        const sepStr = sepChar.repeat(width);
        sep = colorize(sepStr, "dim", useColor);

        headerSegments.push(segment);
        separatorSegments.push(sep);
    }

    outputRows.push({ id: "header", providerName: "header", line: headerSegments.join("   ") });
    outputRows.push({ id: "sep", providerName: "sep", line: separatorSegments.join("   ") });

    // 4. Render lines
    rows.forEach((row) => {
        const segments: string[] = [];
        
        for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const content = row.cells[col];
            const width = widths[col];
            
            let segment = "";
            const visibleLength = content.replace(/\x1b\[[0-9;]*m/g, "").length;
            const padding = Math.max(0, width - visibleLength);

            if (col === "percent") {
                segment = " ".repeat(padding) + content;
            } else {
                segment = content + " ".repeat(padding);
            }
            
            segments.push(segment);
        }

        outputRows.push({
            id: row.quota.id,
            providerName: row.quota.providerName,
            line: segments.join("   "), // Use 3 spaces separator as in example
        });
    });

    return outputRows;
}
