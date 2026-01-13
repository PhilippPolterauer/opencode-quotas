import { test, expect } from "bun:test";
import { QuotaCache } from "../../src/quota-cache";
import { type IQuotaProvider } from "../../src/interfaces";

test("refresh coalesces concurrent calls into a single provider fetch", async () => {
    let fetchCount = 0;

    const provider: IQuotaProvider = {
        id: "test-provider",
        fetchQuota: async () => {
            // Small delay to widen the race window
            await new Promise((r) => setTimeout(r, 10));
            fetchCount++;
            return [
                { id: "q1", providerName: "test", used: 1, limit: 100, unit: "u" },
            ];
        },
    };

    const cache = new QuotaCache([provider]);

    const calls = Array.from({ length: 100 }, () => cache.refresh());
    await Promise.all(calls);

    expect(fetchCount).toBe(1);

    const snapshot = cache.getSnapshot();
    expect(snapshot.data.length).toBe(1);
    expect(snapshot.fetchedAt).not.toBeNull();
});

test("subsequent refresh after completion triggers another fetch", async () => {
    let fetchCount = 0;

    const provider: IQuotaProvider = {
        id: "test-provider-2",
        fetchQuota: async () => {
            await new Promise((r) => setTimeout(r, 5));
            fetchCount++;
            return [
                { id: "q1", providerName: "test2", used: 2, limit: 100, unit: "u" },
            ];
        },
    };

    const cache = new QuotaCache([provider]);

    await cache.refresh();
    expect(fetchCount).toBe(1);

    await cache.refresh();
    expect(fetchCount).toBe(2);
});
