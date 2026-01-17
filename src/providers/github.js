import { readFile } from "node:fs/promises";
import { AUTH_FILE, getConfigDirectory } from "../utils/paths";
import { join } from "node:path";
const AUTH_PATH_LOCAL = AUTH_FILE();
const AUTH_PATH_CONFIG = join(getConfigDirectory(), "auth.json");
async function readAuthFile() {
    for (const path of [AUTH_PATH_LOCAL, AUTH_PATH_CONFIG]) {
        try {
            const raw = await readFile(path, "utf8");
            return JSON.parse(raw);
        }
        catch {
            continue;
        }
    }
    return null;
}
function parseTokenSku(token) {
    const parts = token.split(";");
    for (const part of parts) {
        if (part.startsWith("sku=")) {
            return part.split("=")[1];
        }
    }
    return null;
}
function getNextMonthStart() {
    const now = new Date();
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
    return nextMonth;
}
function formatTimeUntil(target) {
    const diff = target.getTime() - Date.now();
    if (diff <= 0)
        return "soon";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0)
        return `${days}d ${hours}h`;
    return `${hours}h`;
}
export function parseGithubUsage(data, sku, apiWarning) {
    // free_engaged_oss_quota is actually a "pro" equivalent for OSS maintainers
    const isFreeLimited = sku?.includes("free") && !sku?.includes("oss");
    const now = new Date();
    const resetTime = getNextMonthStart();
    const resetStr = `resets in ${formatTimeUntil(resetTime)}`;
    let usedSuggestions = 0;
    let limit = isFreeLimited ? 2000 : null;
    let unit = "suggestions";
    if (Array.isArray(data) && data.length > 0) {
        const currentMonthUsage = data.filter((day) => {
            if (!day || typeof day !== "object")
                return false;
            const dayRecord = day;
            const dayValue = dayRecord["day"];
            if (typeof dayValue !== "string")
                return false;
            const dayDate = new Date(dayValue);
            return dayDate.getUTCMonth() === now.getUTCMonth() && dayDate.getUTCFullYear() === now.getUTCFullYear();
        });
        usedSuggestions = currentMonthUsage.reduce((acc, day) => {
            if (!day || typeof day !== "object")
                return acc;
            const dayRecord = day;
            const suggestions = typeof dayRecord["total_suggestions_count"] === "number" ? dayRecord["total_suggestions_count"] : 0;
            const chat = typeof dayRecord["total_chat_count"] === "number" ? dayRecord["total_chat_count"] : 0;
            return acc + suggestions + chat;
        }, 0);
    }
    const infoParts = [];
    if (isFreeLimited)
        infoParts.push("Free Plan");
    else if (sku)
        infoParts.push("Pro Plan");
    if (apiWarning) {
        infoParts.push("Service Currently Unavailable (API Deprecated)");
    }
    return [
        {
            id: "github-copilot",
            providerName: "GitHub Copilot",
            used: usedSuggestions,
            limit: limit,
            unit: unit,
            reset: resetStr,
            window: "Monthly",
            info: infoParts.join(" | "),
        }
    ];
}
export function createGithubProvider() {
    return {
        id: "github-copilot",
        async fetchQuota() {
            const auth = await readAuthFile();
            if (!auth) {
                throw new Error("Opencode auth.json not found");
            }
            const info = auth["github-copilot"] || auth["github"];
            if (!info || !info.access) {
                throw new Error("GitHub Copilot credentials missing");
            }
            const sku = parseTokenSku(info.access);
            // Note: GitHub does not currently support a user-level Copilot usage
            // endpoint for individual accounts. The legacy/beta endpoints were
            // deprecated (and may return 404). We still attempt the call, but we
            // surface failures as provider metadata so users can diagnose.
            let data = null;
            let apiWarning = null;
            try {
                const response = await fetch("https://api.github.com/user/copilot/usage", {
                    headers: {
                        Authorization: `Bearer ${info.access}`,
                        "X-GitHub-Api-Version": "2022-11-28",
                        Accept: "application/vnd.github+json",
                    },
                });
                if (!response.ok) {
                    if (response.status === 404) {
                        apiWarning = "404";
                    }
                    else {
                        const body = await response.text();
                        apiWarning = `${response.status}: ${body.slice(0, 50)}`;
                    }
                }
                else {
                    data = (await response.json());
                }
            }
            catch (error) {
                apiWarning = "Request Failed";
            }
            return parseGithubUsage(data, sku, apiWarning);
        },
    };
}
