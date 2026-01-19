import { writeFile, readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { HISTORY_FILE } from "../utils/paths";
import { type IHistoryService, type HistoryPoint, type QuotaData } from "../interfaces";
import { logger } from "../logger";

export class HistoryService implements IHistoryService {
    private static readonly CURRENT_VERSION = 1;

    /**
     * Threshold for detecting a quota reset.
     * If current usage drops by more than this percentage of the limit compared to
     * the last recorded usage, we consider it a reset.
     * 
     * Example: If limit is 100 and last usage was 80, a drop to below 60 (80 - 20) 
     * would trigger a reset detection.
     */
    private static readonly RESET_THRESHOLD_PERCENT = 20;

    private historyPath: string;
    private data: Record<string, HistoryPoint[]> = {};
    private maxWindowMs: number = 24 * 60 * 60 * 1000; // Keep 24 hours of history
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(customPath?: string) {
        this.historyPath = customPath || HISTORY_FILE();
    }

    async init(): Promise<void> {
        try {
            const dir = join(this.historyPath, "..");
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }

            if (existsSync(this.historyPath)) {
                const raw = await readFile(this.historyPath, "utf-8");

                let parsed: unknown;
                try {
                    parsed = JSON.parse(raw);
                } catch (e) {
                    logger.error("history-service:parse_failed", { path: this.historyPath, error: e });
                    this.data = {};
                    return;
                }

                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                    const obj = parsed as Record<string, any>;
                    const version = typeof obj.version === "number" ? obj.version : (typeof obj.v === "number" ? obj.v : undefined);

                    if (version !== undefined) {
                        if (version === HistoryService.CURRENT_VERSION) {
                            this.data = (obj.data ?? {}) as Record<string, HistoryPoint[]>;
                        } else {
                            logger.error("history-service:unsupported_version", { path: this.historyPath, version });
                            this.data = (obj.data ?? {}) as Record<string, HistoryPoint[]>;
                        }
                    } else {
                        this.data = parsed as Record<string, HistoryPoint[]>;
                        logger.info("history-service:migrated", { path: this.historyPath, from: "legacy", to: HistoryService.CURRENT_VERSION });

                        // Only persist migrated data if there's something to save
                        if (Object.keys(this.data).length > 0) {
                            await this.flushSave();
                        }
                    }
                } else {
                    logger.error("history-service:init_failed", { path: this.historyPath, error: new Error("invalid_history_format") });
                    this.data = {};
                }
            }
        } catch (e) {
            logger.error("history-service:init_failed", { path: this.historyPath, error: e });
            this.data = {};
        }
    }

    async append(snapshot: QuotaData[]): Promise<void> {
        const timestamp = Date.now();
        let changed = false;
        
        for (const quota of snapshot) {
            if (!this.data[quota.id]) {
                this.data[quota.id] = [];
            }

            const history = this.data[quota.id];
            
            // Reset Detection: Check if usage has dropped significantly, indicating a quota reset
            if (history.length > 0) {
                const lastPoint = history[history.length - 1];
                const resetDetected = this.detectReset(lastPoint, quota);
                
                if (resetDetected) {
                    logger.debug("history-service:reset_detected", {
                        quotaId: quota.id,
                        lastUsed: lastPoint.used,
                        currentUsed: quota.used,
                        limit: quota.limit,
                    });
                    // Clear history for this quota to start fresh
                    this.data[quota.id] = [];
                    changed = true;
                }
            }
            
            this.data[quota.id].push({
                timestamp,
                used: quota.used,
                limit: quota.limit
            });

            // Prune old data for this quota
            const cutoff = timestamp - this.maxWindowMs;
            const originalLength = this.data[quota.id].length;
            this.data[quota.id] = this.data[quota.id].filter(p => p.timestamp >= cutoff);
            
            if (this.data[quota.id].length !== originalLength || originalLength > 0) {
                changed = true;
            }
        }

        if (changed || snapshot.length > 0) {
            this.save();
        }
    }

    /**
     * Detects if a quota has reset by checking if usage dropped significantly.
     * A reset is detected when:
     * 1. The quota has a valid limit (not unlimited)
     * 2. Current usage is significantly lower than the last recorded usage
     * 3. The drop exceeds the threshold (default: 20% of the limit)
     */
    private detectReset(lastPoint: HistoryPoint, currentQuota: QuotaData): boolean {
        // Skip reset detection for unlimited quotas
        if (lastPoint.limit === null || lastPoint.limit <= 0) {
            return false;
        }
        if (currentQuota.limit === null || currentQuota.limit <= 0) {
            return false;
        }

        // Calculate the drop in usage
        const usageDrop = lastPoint.used - currentQuota.used;
        
        // Only consider it a reset if usage actually dropped
        if (usageDrop <= 0) {
            return false;
        }

        // Calculate threshold based on the limit
        const threshold = (HistoryService.RESET_THRESHOLD_PERCENT / 100) * currentQuota.limit;

        // Detect reset if the drop exceeds the threshold
        return usageDrop >= threshold;
    }

    getHistory(quotaId: string, windowMs: number): HistoryPoint[] {
        const now = Date.now();
        const cutoff = now - windowMs;
        const history = this.data[quotaId] || [];
        return history.filter(p => p.timestamp >= cutoff);
    }

    setMaxAge(hours: number): void {
        this.maxWindowMs = hours * 60 * 60 * 1000;
    }

    async pruneAll(): Promise<void> {
        const now = Date.now();
        const cutoff = now - this.maxWindowMs;
        let changed = false;

        for (const id in this.data) {
            const originalLen = this.data[id].length;
            this.data[id] = this.data[id].filter(p => p.timestamp >= cutoff);
            
            if (this.data[id].length !== originalLen) {
                changed = true;
            }

            // Remove key if empty to free memory
            if (this.data[id].length === 0) {
                delete this.data[id];
                changed = true;
            }
        }

        if (changed) {
            this.save();
        }
    }

    private save(): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = setTimeout(async () => {
            try {
                const payload = { version: HistoryService.CURRENT_VERSION, data: this.data };
                await writeFile(this.historyPath, JSON.stringify(payload, null, 2), "utf-8");
                logger.debug("history-service:save_success", { path: this.historyPath });
            } catch (e) {
                logger.error("history-service:save_failed", { path: this.historyPath, error: e });
            }
            this.saveTimeout = null;
        }, 5000);
    }

    /**
     * Immediately write the current data payload to disk (used in tests and migrations).
     */
    private async flushSave(): Promise<void> {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }

        try {
            const payload = { version: HistoryService.CURRENT_VERSION, data: this.data };
            await writeFile(this.historyPath, JSON.stringify(payload, null, 2), "utf-8");
            logger.debug("history-service:save_success", { path: this.historyPath });
        } catch (e) {
            logger.error("history-service:save_failed", { path: this.historyPath, error: e });
        }
    }
}
