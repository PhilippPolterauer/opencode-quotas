/*
 * ISC License
 * Copyright (c) 2026 Philipp
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type QuotaSource = "cloud" | "local" | "auto";

export interface QuotaIndicator {
  threshold: number;
  symbol: string;
}

export interface QuotaConfig {
  quotaSource?: QuotaSource;
  format?: string;
  separator?: string;
  displayMode?: "all" | "current";
  alwaysAppend?: boolean;
  quotaMarker?: string;
  pollingInterval?: number;
  alertThresholds?: number[];
  indicators?: QuotaIndicator[];
}

const DEFAULT_CONFIG: Required<QuotaConfig> = {
  quotaSource: "auto",
  format: "{category}: {percent}% ({resetIn})", // Unused
  separator: " | ", // Unused
  displayMode: "all", // Unused
  alwaysAppend: true, // Unused
  quotaMarker: "> AG Quota:", // Unused
  pollingInterval: 30000,
  alertThresholds: [0.5, 0.1, 0.05],
  indicators: [
    { threshold: 0.2, symbol: "!" },
    { threshold: 0.05, symbol: "!!" },
  ],
};

export async function loadConfig(
  projectDir?: string,
): Promise<Required<QuotaConfig>> {
  const paths: string[] = [];

  if (projectDir) {
    paths.push(join(projectDir, ".opencode", "antigravity-quota.json"));
  } else {
    paths.push(join(process.cwd(), ".opencode", "antigravity-quota.json"));
  }

  paths.push(join(homedir(), ".config", "opencode", "antigravity-quota.json"));

  for (const configPath of paths) {
    try {
      const content = await readFile(configPath, "utf-8");
      const userConfig = JSON.parse(content) as QuotaConfig;
      return { ...DEFAULT_CONFIG, ...userConfig };
    } catch {
      continue;
    }
  }

  return DEFAULT_CONFIG;
}

export { DEFAULT_CONFIG };
