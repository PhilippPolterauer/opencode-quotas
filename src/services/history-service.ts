import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { type IHistoryService, type HistoryPoint, type QuotaData } from "../interfaces";

export class HistoryService implements IHistoryService {
    private historyPath: string;
    private data: Record<string, HistoryPoint[]> = {};
    private maxWindowMs: number = 24 * 60 * 60 * 1000; // Keep 24 hours of history

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
                const raw = readFileSync(this.historyPath, "utf-8");
                this.data = JSON.parse(raw);
            }
        } catch (e) {
            // If debug log was available we would use it, but console.warn is fine for now
            // as this service is often initialized before QuotaService config is loaded.
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

    private save(): void {
        try {
            writeFileSync(this.historyPath, JSON.stringify(this.data, null, 2), "utf-8");
        } catch (e) {
            // Silently fail to avoid crashing the main process
        }
    }
}
