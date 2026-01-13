import { type IQuotaProvider, type QuotaData, type IHistoryService } from "./interfaces";

import { logger } from "./logger";

type CachedQuotas = {
    data: QuotaData[];
    fetchedAt: Date | null;
    lastError: unknown;
};

type QuotaCacheOptions = {
    refreshIntervalMs: number;
    historyService?: IHistoryService;
    debug?: boolean;
};

const DEFAULT_OPTIONS: QuotaCacheOptions = {
    refreshIntervalMs: 60_000,
};

export class QuotaCache {
    private readonly providers: IQuotaProvider[];
    private readonly options: QuotaCacheOptions;
    private state: CachedQuotas;
    private timer: ReturnType<typeof setInterval> | null;
    private inFlight: Promise<void> | null;

    public constructor(providers: IQuotaProvider[], options?: Partial<QuotaCacheOptions>) {
        this.providers = providers;
        this.options = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
        this.state = { data: [], fetchedAt: null, lastError: null };
        this.timer = null;
        this.inFlight = null;
    }

    public start(): void {
        if (this.timer) return;

        // Kick off an initial refresh without blocking startup.
        void this.refresh();

        this.timer = setInterval(() => {
            void this.refresh();
        }, this.options.refreshIntervalMs);

        // Avoid keeping the process alive just for quota polling.
        this.timer.unref?.();
    }

    public stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    public getSnapshot(): CachedQuotas {
        return this.state;
    }

    public async refresh(): Promise<void> {
        logger.debug(
            "cache:refresh_start",
            {
                providerCount: this.providers.length,
                refreshIntervalMs: this.options.refreshIntervalMs,
                inFlight: !!this.inFlight,
            },
        );
        if (this.inFlight) {
            return this.inFlight;
        }

        this.inFlight = (async () => {
            try {
                const results = await Promise.all(
                    this.providers.map(async (p: IQuotaProvider) => {
                        const startedAt = Date.now();
                        try {
                            logger.debug(
                                "cache:provider_fetch_start",
                                { id: p.id },
                            );
                            const result = await p.fetchQuota();
                            logger.debug(
                                "cache:provider_fetch_ok",
                                {
                                    id: p.id,
                                    count: result.length,
                                    durationMs: Date.now() - startedAt,
                                },
                            );
                            return result;
                        } catch (e) {
                            logger.error(
                                "cache:provider_fetch_error",
                                {
                                    id: p.id,
                                    durationMs: Date.now() - startedAt,
                                    error: e,
                                },
                            );
                            // Provider fetch failed
                            return [];
                        }
                    }),
                );

                this.state = {
                    data: results.flat(),
                    fetchedAt: new Date(),
                    lastError: null,
                };

                logger.debug(
                    "cache:refresh_ok",
                    {
                        totalCount: this.state.data.length,
                        fetchedAt: this.state.fetchedAt?.toISOString(),
                    },
                );

                if (this.options.historyService) {
                    void this.options.historyService.append(this.state.data);
                }
            } catch (e) {
                this.state = {
                    ...this.state,
                    lastError: e,
                };
                logger.error(
                    "cache:refresh_error",
                    { error: e },
                );
            } finally {
                logger.debug(
                    "cache:refresh_end",
                    { inFlightCleared: true },
                );
                this.inFlight = null;
            }
        })();

        return this.inFlight;
    }
}
