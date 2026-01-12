import { renderQuotaBarParts, type RenderQuotaBarParts } from "./progress-bar";
import { type ProgressBarConfig, type QuotaData, type QuotaColumn } from "../interfaces";

type RenderedQuotaLine = {
    id: string;
    providerName: string;
    line: string;
};

const DEFAULT_COLUMNS: QuotaColumn[] = ["status", "name", "bar", "percent", "reset"];

export function renderQuotaTable(
    quotas: QuotaData[],
    options: {
        progressBarConfig?: ProgressBarConfig;
        tableConfig?: { columns?: QuotaColumn[] };
    },
): RenderedQuotaLine[] {
    if (quotas.length === 0) return [];

    const columns = options.tableConfig?.columns || DEFAULT_COLUMNS;

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

        return {
            quota,
            barParts,
            cells: {
                name: quota.providerName,
                // If unlimited, we might want a special placeholder for bar/percent or just empty?
                // The original code printed "(Unlimited)" instead of value part.
                bar: barParts ? barParts.bar : (isUnlimited ? "Unlimited" : ""),
                percent: barParts ? barParts.percent : "",
                value: barParts ? barParts.valuePart : `${quota.used} ${quota.unit}`,
                reset: quota.reset || "",
                window: quota.window || "",
                info: quota.info || "",
                status: barParts ? barParts.statusEmoji : "⚪",
            } as Record<QuotaColumn, string>
        };
    });

    // 2. Measure widths
    const widths: Record<QuotaColumn, number> = {
        name: 0, bar: 0, percent: 0, value: 0, reset: 0, window: 0, info: 0, status: 0
    };

    for (const row of rows) {
        for (const col of columns) {
            // ANSI escape codes in `bar` mess up length calculation for padding.
            // We need visible length. 
            // `bar` has ansi codes. `status` is just emoji (len 1 or 2).
            // `percent`, `value`, `reset`, `window`, `info` are plain text.
            // `name` is plain text.
            
            // Simple heuristic: strip ansi for measurement if needed, but `bar` is fixed width mostly.
            // However, `bar` contains ANSI codes which `length` counts.
            // We should use a regex to strip ansi for width calculation.
            const content = row.cells[col];
            const visibleLength = content.replace(/\x1b\[[0-9;]*m/g, "").length;
            
            if (visibleLength > widths[col]) {
                widths[col] = visibleLength;
            }
        }
    }

    // 3. Render lines
    return rows.map((row) => {
        const segments: string[] = [];
        
        for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const content = row.cells[col];
            const width = widths[col];
            
            // Alignments:
            // name: left
            // bar: left (but is fixed width usually)
            // percent: right
            // value: left (usually) or right? Original code had right pad for valuePart but maybe left align.
            // reset/window/info: left
            
            let segment = "";
            const visibleLength = content.replace(/\x1b\[[0-9;]*m/g, "").length;
            const padding = Math.max(0, width - visibleLength);

            if (col === "percent") {
                segment = " ".repeat(padding) + content;
            } else if (col === "name") {
                // Add a colon if it's the name column
                segment = content + " ".repeat(padding) + ":";
            } else {
                segment = content + " ".repeat(padding);
            }
            
            // Add to line
            if (segment.trim().length > 0 || visibleLength > 0) {
                 segments.push(segment);
            }
        }

        return {
            id: row.quota.id,
            providerName: row.quota.providerName,
            line: segments.join(" "),
        };
    });
}
