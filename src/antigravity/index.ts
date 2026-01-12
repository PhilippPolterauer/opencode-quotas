/*
 ISC License

 Copyright (c) 2025, Cristian Militaru

 Permission to use, copy, modify, and/or distribute this software for any
 purpose with or without fee is hereby granted, provided that the above
 copyright notice and this permission notice appear in all copies.

 THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

export interface QuotaInfo {
  remainingFraction: number;
  resetTime?: string;
}

export interface ModelConfig {
  modelName: string;
  label?: string;
  quotaInfo?: QuotaInfo;
}

export function formatRelativeTime(targetDate: Date): string {
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();
  if (diffMs <= 0) return "now";

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;

  if (diffHours > 0) {
    return `${diffHours}h ${remainingMins}m`;
  }
  return `${diffMins}m`;
}

export function formatAbsoluteTime(targetDate: Date): string {
  return targetDate.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export {
  loadConfig,
  formatQuotaEntry,
  DEFAULT_CONFIG,
  type QuotaConfig,
  type QuotaSource,
} from "./config";

export {
  fetchCloudQuota,
  type CloudQuotaResult,
  type CloudAccountInfo,
} from "./cloud";
