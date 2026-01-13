import { formatRelativeTime } from "../../utils/time";
import { getCloudCredentials } from "./auth";
import {
  type IQuotaProvider,
  type QuotaData,
  type QuotaGroup,
} from "../../interfaces";
import { logger } from "../../logger";

const CLOUDCODE_ENDPOINTS = [
  "https://daily-cloudcode-pa.sandbox.googleapis.com",
  "https://autopush-cloudcode-pa.sandbox.googleapis.com",
  "https://cloudcode-pa.googleapis.com",
] as const;

const CLOUDCODE_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "antigravity/1.11.5 windows/amd64",
  "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
  "Client-Metadata":
    '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
} as const;

export interface QuotaIndicator {
  threshold: number;
  symbol: string;
}

export interface AntigravityConfig {
  indicators?: QuotaIndicator[];
  debug?: boolean;
}

interface CloudQuotaInfo {
  remainingFraction?: number;
  resetTime?: string;
}

interface CloudModelInfo {
  displayName?: string;
  model?: string;
  quotaInfo?: CloudQuotaInfo;
  supportsImages?: boolean;
  supportsThinking?: boolean;
  recommended?: boolean;
}

interface FetchModelsResponse {
  models?: Record<string, CloudModelInfo>;
}

export interface QuotaInfo {
  remainingFraction: number;
  resetTime?: string;
}

export interface ModelConfig {
  modelName: string;
  label?: string;
  quotaInfo?: QuotaInfo;
}

export interface CloudAccountInfo {
  email?: string;
  projectId?: string;
}

export interface CloudQuotaResult {
  account: CloudAccountInfo;
  models: ModelConfig[];
  timestamp: number;
}

const DEFAULT_INDICATORS: QuotaIndicator[] = [
  { threshold: 0.2, symbol: "!" },
  { threshold: 0.05, symbol: "!!" },
];

function getIndicatorSymbol(
  fraction: number,
  indicators: QuotaIndicator[] = DEFAULT_INDICATORS,
): string {
  if (indicators.length === 0) return "";
  const sorted = [...indicators].sort((a, b) => a.threshold - b.threshold);
  for (const indicator of sorted) {
    if (fraction <= indicator.threshold) {
      return ` ${indicator.symbol}`;
    }
  }
  return "";
}

async function fetchAvailableModels(
  accessToken: string,
  projectId: string | undefined,
  debugEnabled: boolean,
): Promise<FetchModelsResponse> {
  const payload = projectId ? { project: projectId } : {};
  let lastError: Error | null = null;

  const headers: Record<string, string> = {
    ...CLOUDCODE_HEADERS,
    Authorization: `Bearer ${accessToken}`,
  };

  for (const endpoint of CLOUDCODE_ENDPOINTS) {
    try {
      const url = `${endpoint}/v1internal:fetchAvailableModels`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

       try {
        if (debugEnabled) {
          logger.debug(
            "antigravity:request",
            {
              endpoint,
              url,
              hasProjectId: !!projectId,
            },
          );
        }


         const response = await fetch(url, {
           method: "POST",
           headers,
           body: JSON.stringify(payload),
           signal: controller.signal,
         });

        if (debugEnabled) {
          logger.debug(
            "antigravity:response_meta",
            {
              endpoint,
              status: response.status,
              ok: response.ok,
              contentType: response.headers.get("content-type"),
            },
          );
        }


         if (response.status === 401) {
           throw new Error("Authorization expired or invalid.");
         }


        if (response.status === 403) {
          throw new Error(
            "Access forbidden (403). Check your account permissions.",
          );
        }

         if (!response.ok) {
           const text = await response.text();
          if (debugEnabled) {
            logger.debug(
              "antigravity:error_body",
              {
                endpoint,
                status: response.status,
                bodyPreview: text.slice(0, 2000),
              },
            );
          }

           throw new Error(
             `Cloud Code API error ${response.status}: ${text.slice(0, 200)}`,
           );
         }

         const json = (await response.json()) as FetchModelsResponse;

         const modelCount = Object.keys(json.models || {}).length;
         if (debugEnabled) {
          logger.debug("antigravity:fetch_success", { modelCount });
        }

         if (debugEnabled) {
           const sampleKeys = Object.keys(json.models || {}).slice(0, 8);
           const sanitizedSample: Record<string, unknown> = {};
           for (const key of sampleKeys) {
             sanitizedSample[key] = json.models?.[key];
           }

          logger.debug(
            "antigravity:raw_response_sample",
            {
              modelCount,
              sampleKeys,
              sample: sanitizedSample,
            },
          );


         }

         return json;

      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (
        lastError.message.includes("Authorization") ||
        lastError.message.includes("forbidden") ||
        lastError.message.includes("invalid_grant")
      ) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error("All Cloud Code API endpoints failed");
}

export async function fetchCloudQuota(
  accessToken: string,
  projectId?: string,
  debugEnabled: boolean = false,
): Promise<CloudQuotaResult> {
  if (!accessToken) {
    throw new Error("Access token is required for cloud quota fetching");
  }

  const response = await fetchAvailableModels(accessToken, projectId, debugEnabled);

  const models: ModelConfig[] = [];

  if (response.models) {
    for (const [modelKey, info] of Object.entries(response.models)) {
      if (!info.quotaInfo) continue;

      models.push({
        modelName: info.model || modelKey,
        label: info.displayName || modelKey,
        quotaInfo: {
          remainingFraction: info.quotaInfo.remainingFraction ?? 0,
          resetTime: info.quotaInfo.resetTime,
        },
      });
    }
  }

  return {
    account: {
      projectId,
    },
    models,
    timestamp: Date.now(),
  };
}

/**
 * Categorize models based on user-defined groups or fall back to defaults.
 */
function categorizeModel(label: string, groups?: QuotaGroup[]): string | null {
  const lowerLabel = label.toLowerCase();

  if (groups && groups.length > 0) {
    // Special case: if groups are provided, we ONLY show models that match a group.
    // This allows users to "filter" and show specific models individually by creating
    // a 1-to-1 mapping.
    for (const group of groups) {
      if (group.patterns.some((p) => lowerLabel.includes(p.toLowerCase()))) {
        return group.name;
      }
    }
    return null;
  }

  // Sensible defaults for Antigravity/Google models when no custom groups are defined
  if (lowerLabel.includes("flash")) return "Flash";
  if (lowerLabel.includes("gemini") || lowerLabel.includes("pro")) return "Pro";
  if (
    lowerLabel.includes("claude") ||
    lowerLabel.includes("gpt") ||
    lowerLabel.includes("o1")
  ) {
    return "Premium";
  }

  return "Other";
}

/**
 * Groups raw model configs into logical categories and picks the lowest remaining quota
 * as the representative for that category.
 */
function groupModelsByCategory(models: ModelConfig[], groups?: QuotaGroup[]) {
  const categories: Record<
    string,
    { remainingFraction: number; resetTime: Date | null }
  > = {};

  for (const model of models) {
    const label = model.label || model.modelName || "";
    const category = categorizeModel(label, groups);

    if (category === null) continue;

    // Robustness: If quotaInfo is missing or incomplete, skip this model
    // instead of defaulting to 0 (which would mean 100% used).
    if (
      !model.quotaInfo ||
      typeof model.quotaInfo.remainingFraction !== "number"
    ) {
      continue;
    }

    const fraction = model.quotaInfo.remainingFraction;
    const resetTime = model.quotaInfo.resetTime
      ? new Date(model.quotaInfo.resetTime)
      : null;

    if (
      !categories[category] ||
      fraction < categories[category].remainingFraction
    ) {
      categories[category] = { remainingFraction: fraction, resetTime };
    }
  }

  return categories;
}

export function createAntigravityProvider(
  groups?: QuotaGroup[],
  config: AntigravityConfig = {},
): IQuotaProvider {
  return {
    id: "antigravity",
    async fetchQuota(): Promise<QuotaData[]> {
      const debugEnabled = !!config.debug;
      logger.debug("provider:antigravity:fetch_start", { configDebug: config.debug });

      // Fetch cloud credentials (Google OAuth)
      let credentials;
      try {
        credentials = await getCloudCredentials();
        if (debugEnabled) {
          logger.debug(
            "provider:antigravity:auth_ok",
            { projectId: credentials.projectId },
          );
        }
      } catch (e) {
        logger.error("provider:antigravity:auth_failed", e);
        throw e;
      }

      // Fetch live quota from Antigravity Cloud API
      const cloudResult = await fetchCloudQuota(
        credentials.accessToken,
        credentials.projectId,
        debugEnabled,
      );
      if (debugEnabled) {
        logger.debug(
          "provider:antigravity:cloud_ok",
          { modelCount: cloudResult.models.length },
        );
      }

      const categoryMap = groupModelsByCategory(cloudResult.models, groups);
      const entries: QuotaData[] = [];
      if (debugEnabled) {
        logger.debug(
          "provider:antigravity:grouping",
          { categories: Object.keys(categoryMap), hasGroups: !!groups?.length },
        );
      }

      for (const [category, data] of Object.entries(categoryMap)) {
        const remainingFraction = data.remainingFraction;
        const usedPercent = Math.max(
          0,
          Math.min(100, (1 - remainingFraction) * 100),
        );

        // Calculate metadata
        const indicator = getIndicatorSymbol(
          remainingFraction,
          config.indicators,
        );

        let reset: string | undefined;
        if (data.resetTime) {
          reset = `resets in ${formatRelativeTime(data.resetTime)}`;
        }

        entries.push({
          id: `ag-${category.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
          providerName: `Antigravity ${category}`,
          used: usedPercent,
          limit: 100,
          unit: "%",
          reset,
          info: indicator.trim() || undefined,
        });
      }

      if (debugEnabled) {
        logger.debug(
          "provider:antigravity:fetch_ok",
          { count: entries.length },
        );
      }
      return entries;
    },
  };
}
