import { readFile } from "node:fs/promises";
import { AUTH_FILE } from "../utils/paths";
import { logger } from "../logger";
const DEFAULT_BASE_URL = "https://chatgpt.com/backend-api";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ERROR_BODY_CHARS = 2_000;
async function readAuthFile() {
    try {
        const authPath = AUTH_FILE();
        const raw = await readFile(authPath, "utf8");
        const parsed = JSON.parse(raw);
        return parsed;
    }
    catch (e) {
        logger.debug("provider:codex:auth_read_failed", { authPath: AUTH_FILE(), error: e });
        return null;
    }
}
function pickOauthAuth(auth) {
    const preferred = ["opencode", "codex", "openai"];
    for (const providerID of preferred) {
        const info = auth[providerID];
        if (info?.type === "oauth") {
            return {
                providerID,
                access: info.access,
                enterpriseUrl: info.enterpriseUrl,
            };
        }
    }
    for (const [providerID, info] of Object.entries(auth)) {
        if (info.type === "oauth") {
            return {
                providerID,
                access: info.access,
                enterpriseUrl: info.enterpriseUrl,
            };
        }
    }
    return null;
}
function buildUsageUrl(baseUrl) {
    const trimmed = baseUrl.replace(/\/+$/, "");
    if (trimmed.includes("/backend-api")) {
        return `${trimmed}/wham/usage`;
    }
    return `${trimmed}/api/codex/usage`;
}
async function fetchQuotaPayload(accessToken, baseUrl) {
    const url = buildUsageUrl(baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            signal: controller.signal,
        });
        const bodyText = await response.text();
        let payload = null;
        try {
            payload = JSON.parse(bodyText);
        }
        catch {
            payload = bodyText;
        }
        if (!response.ok) {
            const error = new Error(`quota request failed (${response.status})`);
            error.cause = {
                status: response.status,
                bodyText: bodyText.slice(0, MAX_ERROR_BODY_CHARS),
            };
            throw error;
        }
        return payload;
    }
    finally {
        clearTimeout(timeout);
    }
}
function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return null;
}
function describeWindow(windowSeconds) {
    if (!windowSeconds || windowSeconds <= 0)
        return null;
    const minutes = Math.round(windowSeconds / 60);
    if (minutes >= 60 && minutes % 60 === 0) {
        const hours = minutes / 60;
        return `${hours}h window`;
    }
    return `${minutes}m window`;
}
function formatRelativeSeconds(seconds) {
    if (seconds <= 0)
        return "now";
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours > 0) {
        return `${hours}h ${remainingMinutes}m`;
    }
    return `${minutes}m`;
}
function parseRateLimitWindow(id, label, snapshot) {
    const usedPercent = toNumber(snapshot.used_percent);
    if (usedPercent === null)
        return null;
    // Window info
    let window;
    const windowSeconds = toNumber(snapshot.limit_window_seconds);
    const windowLabel = describeWindow(windowSeconds);
    if (windowLabel)
        window = windowLabel;
    // Reset info
    let reset;
    const resetAfter = toNumber(snapshot.reset_after_seconds);
    const resetAt = toNumber(snapshot.reset_at);
    if (resetAfter !== null) {
        reset = `resets in ${formatRelativeSeconds(resetAfter)}`;
    }
    else if (resetAt !== null) {
        reset = `resets at ${new Date(resetAt * 1000).toLocaleTimeString()}`;
    }
    return {
        id: `codex-${id}`,
        providerName: `Codex ${label}`,
        used: Math.max(0, Math.min(100, usedPercent)),
        limit: 100,
        unit: "%",
        window,
        reset,
    };
}
function parseCredits(credits) {
    const base = {
        id: "codex-credits",
        providerName: "Codex Credits",
        unit: "credits",
    };
    if (credits.unlimited) {
        return {
            ...base,
            used: 0,
            limit: null,
            info: "unlimited",
        };
    }
    const balance = toNumber(credits.balance ?? null);
    if (balance === null)
        return null;
    return {
        ...base,
        used: balance,
        limit: null,
        info: "balance",
    };
}
export function extractCodexQuota(payload) {
    if (!isObject(payload))
        return [];
    const rateLimitCandidate = payload["rate_limit"];
    const rateLimit = isObject(rateLimitCandidate) ? rateLimitCandidate : null;
    const entries = [];
    if (rateLimit) {
        const primary = isObject(rateLimit.primary_window)
            ? rateLimit.primary_window
            : null;
        const secondary = isObject(rateLimit.secondary_window)
            ? rateLimit.secondary_window
            : null;
        if (primary) {
            const entry = parseRateLimitWindow("primary", "Primary", primary);
            if (entry)
                entries.push(entry);
        }
        if (secondary) {
            const entry = parseRateLimitWindow("secondary", "Secondary", secondary);
            if (entry)
                entries.push(entry);
        }
    }
    const creditsCandidate = payload["credits"];
    const credits = isObject(creditsCandidate) ? creditsCandidate : null;
    if (credits) {
        const creditEntry = parseCredits(credits);
        if (creditEntry)
            entries.push(creditEntry);
    }
    return entries;
}
export function createCodexProvider() {
    return {
        id: "codex",
        async fetchQuota() {
            logger.debug("provider:codex:fetch_start", { authPath: AUTH_FILE() });
            const auth = await readAuthFile();
            if (!auth) {
                logger.debug("provider:codex:no_auth", { authPath: AUTH_FILE() });
                throw new Error("Codex auth.json not found");
            }
            const oauth = pickOauthAuth(auth);
            if (!oauth) {
                logger.debug("provider:codex:no_oauth", { availableProviders: Object.keys(auth) });
                throw new Error("Codex OAuth credentials missing");
            }
            const baseUrl = process.env.OPENCODE_CODEX_BASE_URL ??
                oauth.enterpriseUrl ??
                DEFAULT_BASE_URL;
            logger.debug("provider:codex:request", { providerID: oauth.providerID, baseUrl, url: buildUsageUrl(baseUrl) });
            const payload = await fetchQuotaPayload(oauth.access, baseUrl);
            const entries = extractCodexQuota(payload);
            logger.debug("provider:codex:parse", { count: entries.length });
            if (entries.length === 0) {
                throw new Error("Codex quota payload did not include rate limits");
            }
            return entries;
        },
    };
}
