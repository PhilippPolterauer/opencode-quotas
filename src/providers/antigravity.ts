import {
  fetchCloudQuota,
  formatAbsoluteTime,
  formatRelativeTime,
  loadConfig,
  type ModelConfig,
  type QuotaConfig as AGConfig,
} from "../antigravity/index";
import { getCloudCredentials } from "../antigravity/auth";
import {
  type IQuotaProvider,
  type QuotaData,
  type QuotaGroup,
} from "../interfaces";

function getIndicatorSymbol(
  config: Required<AGConfig>,
  fraction: number,
): string {
  if (!config.indicators || config.indicators.length === 0) return "";
  const sorted = [...config.indicators].sort(
    (a, b) => a.threshold - b.threshold,
  );
  for (const indicator of sorted) {
    if (fraction <= indicator.threshold) {
      return ` ${indicator.symbol}`;
    }
  }
  return "";
}

function buildDetails(
  config: Required<AGConfig>,
  remainingFraction: number,
  resetTime: Date | null,
): string {
  const remainingPercent = Math.max(0, Math.min(100, remainingFraction * 100));
  const indicator = getIndicatorSymbol(config, remainingFraction);
  const remainingLabel = `${Math.round(remainingPercent)}% remaining${indicator}`;

  if (!resetTime) {
    return remainingLabel;
  }

  const resetIn = formatRelativeTime(resetTime);
  const resetAt = formatAbsoluteTime(resetTime);
  return `${remainingLabel} | resets in ${resetIn} (${resetAt})`;
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

    const fraction = model.quotaInfo?.remainingFraction ?? 0;
    const resetTime = model.quotaInfo?.resetTime
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
): IQuotaProvider {
  const configPromise = loadConfig();

  return {
    id: "antigravity",
    async fetchQuota(): Promise<QuotaData[]> {
      const config = await configPromise;

      // Fetch cloud credentials (Google OAuth)
      const credentials = await getCloudCredentials();

      // Fetch live quota from Antigravity Cloud API
      const cloudResult = await fetchCloudQuota(
        credentials.accessToken,
        credentials.projectId,
      );

      const categoryMap = groupModelsByCategory(cloudResult.models, groups);
      const entries: QuotaData[] = [];

      for (const [category, data] of Object.entries(categoryMap)) {
        const remainingFraction = data.remainingFraction;
        const usedPercent = Math.max(
          0,
          Math.min(100, (1 - remainingFraction) * 100),
        );
        const details = buildDetails(config, remainingFraction, data.resetTime);

        entries.push({
          id: `ag-${category.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
          providerName: `Antigravity ${category}`,
          used: usedPercent,
          limit: 100,
          unit: "%",
          details,
        });
      }

      return entries;
    },
  };
}
