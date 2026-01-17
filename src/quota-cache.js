import { validateQuotaData } from "./utils/validation";
import { logger } from "./logger";
const DEFAULT_OPTIONS = {
    refreshIntervalMs: 60_000,
};
export class QuotaCache {
    providers;
    options;
    state;
    timer;
    inFlight;
    constructor(providers, options) {
        this.providers = providers;
        this.options = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
        this.state = { data: [], fetchedAt: null, lastError: null };
        this.timer = null;
        this.inFlight = null;
    }
    start() {
        if (this.timer)
            return;
        // Kick off an initial refresh without blocking startup.
        void this.refresh();
        this.timer = setInterval(() => {
            void this.refresh();
        }, this.options.refreshIntervalMs);
        // Avoid keeping the process alive just for quota polling.
        this.timer.unref?.();
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    getSnapshot() {
        return this.state;
    }
    async refresh() {
        logger.debug("cache:refresh_start", {
            providerCount: this.providers.length,
            refreshIntervalMs: this.options.refreshIntervalMs,
            inFlight: !!this.inFlight,
        });
        if (this.inFlight) {
            logger.debug("cache:refresh_coalesced", { inFlight: true });
            return this.inFlight;
        }
        const refreshPromise = this.doRefresh();
        this.inFlight = refreshPromise;
        return refreshPromise;
    }
    async doRefresh() {
        try {
            const results = await Promise.all(this.providers.map(async (p) => {
                const startedAt = Date.now();
                try {
                    logger.debug("cache:provider_fetch_start", { id: p.id });
                    const result = await p.fetchQuota();
                    logger.debug("cache:provider_fetch_ok", {
                        id: p.id,
                        count: result.length,
                        durationMs: Date.now() - startedAt,
                    });
                    return result;
                }
                catch (e) {
                    logger.error("cache:provider_fetch_error", {
                        id: p.id,
                        durationMs: Date.now() - startedAt,
                        error: e,
                    });
                    return [];
                }
            }));
            // Validate and normalize provider responses before storing
            const flattened = results.flat();
            const validatedData = flattened
                .map(d => validateQuotaData(d))
                .filter((v) => v !== null);
            this.state = {
                data: validatedData,
                fetchedAt: new Date(),
                lastError: null,
            };
            logger.debug("cache:refresh_ok", {
                totalCount: this.state.data.length,
                fetchedAt: this.state.fetchedAt?.toISOString(),
            });
            if (this.options.historyService) {
                void this.options.historyService.append(this.state.data);
            }
        }
        catch (e) {
            this.state = {
                ...this.state,
                lastError: e,
            };
            logger.error("cache:refresh_error", { error: e });
        }
        finally {
            logger.debug("cache:refresh_end", { inFlightCleared: true });
            this.inFlight = null;
        }
    }
}
