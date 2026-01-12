import { type IQuotaProvider, type QuotaData } from "./interfaces";

type CachedQuotas = {
    data: QuotaData[];
    fetchedAt: Date | null;
    lastError: unknown;
};

type QuotaCacheOptions = {
    refreshIntervalMs: number;
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
        if (this.inFlight) {
            return this.inFlight;
        }

        this.inFlight = (async () => {
            try {
                const results = await Promise.all(
                    this.providers.map(async (p: IQuotaProvider) => {
                        try {
                            return await p.fetchQuota();
                        } catch (e) {
                            console.debug(`[QuotaHub] Provider ${p.id} fetch failed:`, e);
                            return [];
                        }
                    }),
                );

                this.state = {
                    data: results.flat(),
                    fetchedAt: new Date(),
                    lastError: null,
                };
            } catch (e) {
                this.state = {
                    ...this.state,
                    lastError: e,
                };
            } finally {
                this.inFlight = null;
            }
        })();

        return this.inFlight;
    }
}
