export function isValidNumber(v) {
    return typeof v === "number" && Number.isFinite(v);
}
export function clamp(value, min, max) {
    if (!Number.isFinite(value))
        return min;
    if (value < min)
        return min;
    if (max !== undefined && value > max)
        return max;
    return value;
}
export function validatePollingInterval(v) {
    if (v === null || v === undefined)
        return null;
    const n = typeof v === "string" ? Number(v.trim()) : Number(v);
    if (!Number.isFinite(n) || n <= 0)
        return null;
    return n;
}
export function validateQuotaData(input) {
    if (typeof input !== "object" || input === null)
        return null;
    const q = input;
    if (!q.id || typeof q.id !== "string")
        return null;
    if (!q.providerName || typeof q.providerName !== "string")
        return null;
    let used = Number(q.used ?? 0);
    if (!Number.isFinite(used))
        used = 0;
    if (used < 0)
        used = 0;
    let limit = null;
    if (q.limit === null) {
        limit = null;
    }
    else if (q.limit !== undefined) {
        const n = Number(q.limit);
        if (Number.isFinite(n) && n > 0) {
            limit = n;
        }
        else {
            limit = null;
        }
    }
    const unit = typeof q.unit === "string" ? q.unit : "";
    const reset = typeof q.reset === "string" ? q.reset : undefined;
    const predictedReset = typeof q.predictedReset === "string" ? q.predictedReset : undefined;
    const window = typeof q.window === "string" ? q.window : undefined;
    const info = typeof q.info === "string" ? q.info : undefined;
    const details = typeof q.details === "string" ? q.details : undefined;
    return {
        id: q.id,
        providerName: q.providerName,
        used,
        limit,
        unit,
        reset,
        predictedReset,
        window,
        info,
        details,
    };
}
