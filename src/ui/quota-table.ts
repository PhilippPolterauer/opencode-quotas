import { renderQuotaBarParts, type RenderQuotaBarParts } from "./progress-bar";
import { type ProgressBarConfig, type QuotaData } from "../interfaces";

type RenderedQuotaLine = {
    id: string;
    providerName: string;
    line: string;
};

export function renderQuotaTable(
    quotas: QuotaData[],
    options: {
        progressBarConfig?: ProgressBarConfig;
    },
): RenderedQuotaLine[] {
    if (quotas.length === 0) return [];

    const maxProviderLen = Math.max(...quotas.map((q) => q.providerName.length));

    const partsByQuota: Array<{ quota: QuotaData; parts: RenderQuotaBarParts } | null> = quotas.map(
        (quota) => {
            if (quota.limit === null || quota.limit <= 0) return null;
            return {
                quota,
                parts: renderQuotaBarParts(quota.used, quota.limit, {
                    label: "",
                    unit: quota.unit,
                    details: quota.details,
                    config: options.progressBarConfig,
                }),
            };
        },
    );

    const maxPercentLen = Math.max(
        ...partsByQuota.map((p) => (p ? p.parts.percent.length : 0)),
        0,
    );
    const maxValueLen = Math.max(
        ...partsByQuota.map((p) => (p ? p.parts.valuePart.length : 0)),
        0,
    );

    const detailSegments = quotas.map((q) =>
        q.details ? q.details.split("|").map((s) => s.trim()) : [],
    );

    const maxCols = Math.max(0, ...detailSegments.map((s) => s.length));
    const colWidths = new Array(maxCols).fill(0);

    for (const segments of detailSegments) {
        segments.forEach((s, i) => {
            if (s.length > colWidths[i]) {
                colWidths[i] = s.length;
            }
        });
    }

    return quotas.map((quota, index) => {
        const segments = detailSegments[index];
        const detailsStr = segments
            .map((s, i) => (i < segments.length - 1 ? s.padEnd(colWidths[i]) : s))
            .join(" | ");
        const detailsPart = detailsStr ? ` | ${detailsStr}` : "";

        const name = quota.providerName.padEnd(maxProviderLen);
        const label = `${name}`;

        if (quota.limit === null || quota.limit <= 0) {
            return {
                id: quota.id,
                providerName: quota.providerName,
                line: `${label}: ${quota.used} ${quota.unit} (Unlimited)${detailsPart}`,
            };
        }

        const partEntry = partsByQuota.find((p) => p?.quota.id === quota.id);
        const parts = partEntry?.parts;

        if (!parts) {
            return {
                id: quota.id,
                providerName: quota.providerName,
                line: `${label}: (render error)`,
            };
        }

        const percent = parts.percent.padStart(maxPercentLen);
        const valuePart = parts.valuePart.padEnd(maxValueLen);

        return {
            id: quota.id,
            providerName: quota.providerName,
            line: `${label}: ${parts.bar} ${percent} ${valuePart}${detailsPart}`,
        };
    });
}
