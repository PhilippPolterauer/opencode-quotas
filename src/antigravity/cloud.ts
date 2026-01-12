/*
 * ISC License
 * Copyright (c) 2025, Cristian Militaru
 * Copyright (c) 2026, Philipp
 */

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

async function fetchAvailableModels(
  accessToken: string,
  projectId?: string,
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

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

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
        throw new Error(
          `Cloud Code API error ${response.status}: ${text.slice(0, 200)}`,
        );
      }

      return (await response.json()) as FetchModelsResponse;
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
): Promise<CloudQuotaResult> {
  if (!accessToken) {
    throw new Error("Access token is required for cloud quota fetching");
  }

  const response = await fetchAvailableModels(accessToken, projectId);

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
