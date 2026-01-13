import { readFile } from "node:fs/promises";
import { AUTH_FILE } from "../utils/paths";
import { type IQuotaProvider, type QuotaData } from "../interfaces";
import { logToDebugFile } from "../utils/debug";

const AUTH_PATH = AUTH_FILE();
const DEFAULT_BASE_URL = "https://chatgpt.com/backend-api";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ERROR_BODY_CHARS = 2_000;

type OauthAuth = {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
  enterpriseUrl?: string;
};

type ApiAuth = {
  type: "api";
  key: string;
};

type WellKnownAuth = {
  type: "wellknown";
  key: string;
  token: string;
};

type AuthInfo = OauthAuth | ApiAuth | WellKnownAuth;

type AuthFile = Record<string, AuthInfo>;

type OauthSelection = {
  providerID: string;
  access: string;
  enterpriseUrl?: string;
};

type RateLimitWindowSnapshot = {
  used_percent?: number;
  limit_window_seconds?: number;
  reset_after_seconds?: number;
  reset_at?: number;
};

type RateLimitStatusDetails = {
  primary_window?: RateLimitWindowSnapshot | null;
  secondary_window?: RateLimitWindowSnapshot | null;
};

type CreditStatusDetails = {
  unlimited?: boolean;
  balance?: string | null;
};

type RateLimitStatusPayload = {
  plan_type?: string;
  rate_limit?: RateLimitStatusDetails | null;
  credits?: CreditStatusDetails | null;
};

async function readAuthFile(): Promise<AuthFile | null> {
  try {
    const raw = await readFile(AUTH_PATH, "utf8");
    const parsed = JSON.parse(raw) as AuthFile;
    return parsed;
  } catch (e) {
    logToDebugFile(
      "provider:codex:auth_read_failed",
      { authPath: AUTH_PATH, error: e },
      process.env.OPENCODE_QUOTAS_DEBUG === "1",
    );
    // Fallback: try the config directory location
    try {
      const configPath = AUTH_PATH.replace("auth.json", "antigravity-accounts.json");
      // If the replacement is not valid, this will likely fail and we return null
      const rawConfig = await readFile(configPath, "utf8");
      return JSON.parse(rawConfig) as AuthFile;
    } catch {
      return null;
    }
  }
}

function pickOauthAuth(auth: AuthFile): OauthSelection | null {
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

function buildUsageUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.includes("/backend-api")) {
    return `${trimmed}/wham/usage`;
  }
  return `${trimmed}/api/codex/usage`;
}

async function fetchQuotaPayload(
  accessToken: string,
  baseUrl: string,
): Promise<unknown> {
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
    let payload: unknown = null;
    try {
      payload = JSON.parse(bodyText);
    } catch {
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
  } finally {
    clearTimeout(timeout);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function describeWindow(windowSeconds: number | null): string | null {
  if (!windowSeconds || windowSeconds <= 0) return null;
  const minutes = Math.round(windowSeconds / 60);
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours}h window`;
  }
  return `${minutes}m window`;
}

function formatRelativeSeconds(seconds: number): string {
  if (seconds <= 0) return "now";
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m`;
}

function parseRateLimitWindow(
  id: string,
  label: string,
  snapshot: RateLimitWindowSnapshot,
): QuotaData | null {
  const usedPercent = toNumber(snapshot.used_percent);
  if (usedPercent === null) return null;

  // Window info
  let window: string | undefined;
  const windowSeconds = toNumber(snapshot.limit_window_seconds);
  const windowLabel = describeWindow(windowSeconds);
  if (windowLabel) window = windowLabel;

  // Reset info
  let reset: string | undefined;
  const resetAfter = toNumber(snapshot.reset_after_seconds);
  const resetAt = toNumber(snapshot.reset_at);
  if (resetAfter !== null) {
    reset = `resets in ${formatRelativeSeconds(resetAfter)}`;
  } else if (resetAt !== null) {
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

function parseCredits(credits: CreditStatusDetails): QuotaData | null {
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
  if (balance === null) return null;

  return {
    ...base,
    used: balance,
    limit: null,
    info: "balance",
  };
}

export function extractCodexQuota(payload: unknown): QuotaData[] {
  if (!isObject(payload)) return [];

  const rateLimitCandidate = (payload as Record<string, unknown>)["rate_limit"];
  const rateLimit = isObject(rateLimitCandidate) ? rateLimitCandidate : null;

  const entries: QuotaData[] = [];

  if (rateLimit) {
    const primary = isObject(rateLimit.primary_window)
      ? (rateLimit.primary_window as RateLimitWindowSnapshot)
      : null;
    const secondary = isObject(rateLimit.secondary_window)
      ? (rateLimit.secondary_window as RateLimitWindowSnapshot)
      : null;

    if (primary) {
      const entry = parseRateLimitWindow("primary", "Primary", primary);
      if (entry) entries.push(entry);
    }

    if (secondary) {
      const entry = parseRateLimitWindow("secondary", "Secondary", secondary);
      if (entry) entries.push(entry);
    }
  }

  const creditsCandidate = (payload as Record<string, unknown>)["credits"];
  const credits = isObject(creditsCandidate) ? creditsCandidate : null;

  if (credits) {
    const creditEntry = parseCredits(credits as CreditStatusDetails);
    if (creditEntry) entries.push(creditEntry);
  }

  return entries;
}

export function createCodexProvider(): IQuotaProvider {
  return {
    id: "codex",
    async fetchQuota(): Promise<QuotaData[]> {
      logToDebugFile(
        "provider:codex:fetch_start",
        { authPath: AUTH_PATH },
        process.env.OPENCODE_QUOTAS_DEBUG === "1",
      );

      const auth = await readAuthFile();
      if (!auth) {
        logToDebugFile(
          "provider:codex:no_auth",
          { authPath: AUTH_PATH },
          process.env.OPENCODE_QUOTAS_DEBUG === "1",
        );
        throw new Error("Codex auth.json not found");
      }

      const oauth = pickOauthAuth(auth);
      if (!oauth) {
        logToDebugFile(
          "provider:codex:no_oauth",
          { availableProviders: Object.keys(auth) },
          process.env.OPENCODE_QUOTAS_DEBUG === "1",
        );
        throw new Error("Codex OAuth credentials missing");
      }

      const baseUrl =
        process.env.OPENCODE_CODEX_BASE_URL ??
        oauth.enterpriseUrl ??
        DEFAULT_BASE_URL;

      logToDebugFile(
        "provider:codex:request",
        { providerID: oauth.providerID, baseUrl, url: buildUsageUrl(baseUrl) },
        process.env.OPENCODE_QUOTAS_DEBUG === "1",
      );

      const payload = await fetchQuotaPayload(oauth.access, baseUrl);
      const entries = extractCodexQuota(payload);

      logToDebugFile(
        "provider:codex:parse",
        { count: entries.length },
        process.env.OPENCODE_QUOTAS_DEBUG === "1",
      );

      if (entries.length === 0) {
        throw new Error("Codex quota payload did not include rate limits");
      }

      return entries;
    },
  };
}
