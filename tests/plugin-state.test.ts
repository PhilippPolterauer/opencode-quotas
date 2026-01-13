import { expect, test, describe } from "bun:test";
import { PluginState } from "../src/plugin-state";

describe("PluginState eviction", () => {
    test("evicts oldest message when exceeding max", () => {
        const state = new PluginState();
        const max = (PluginState as any).MAX_TRACKED_MESSAGES as number;

        for (let i = 0; i < max; i++) {
            state.markProcessed(`msg-${i}`);
        }

        expect(state.isProcessed("msg-0")).toBe(true);

        // Add one more to trigger eviction
        state.markProcessed(`msg-${max}`);

        expect(state.isProcessed("msg-0")).toBe(false);
        expect(state.isProcessed(`msg-${max}`)).toBe(true);
        expect(state.isProcessed(`msg-1`)).toBe(true);
    });

    test("isProcessed returns false for unknown message", () => {
        const state = new PluginState();
        expect(state.isProcessed("unknown")).toBe(false);
    });
});
