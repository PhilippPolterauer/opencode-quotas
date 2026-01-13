import { writeFile, readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { type IHistoryService, type HistoryPoint, type QuotaData } from "../interfaces";
import { logger } from "../logger";

export class HistoryService implements IHistoryService {
    private historyPath: string;
    private data: Record<string, HistoryPoint[]> = {};
    private maxWindowMs: number = 24 * 60 * 60 * 1000; // Keep 24 hours of history
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(customPath?: string) {
        this.historyPath = customPath || join(homedir(), ".local", "share", "opencode", "quota-history.json");
    }

    async init(): Promise<void> {
        try {
            const dir = join(this.historyPath, "..");
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }

            if (existsSync(this.historyPath)) {
                const raw = await readFile(this.historyPath, "utf-8");
                this.data = JSON.parse(raw);
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
                await writeFile(this.historyPath, JSON.stringify(this.data, null, 2), "utf-8");
                logger.debug("history-service:save_success", { path: this.historyPath });
            } catch (e) {
                logger.error("history-service:save_failed", { path: this.historyPath, error: e });
            }
            this.saveTimeout = null;
        }, 5000);
    }
}
