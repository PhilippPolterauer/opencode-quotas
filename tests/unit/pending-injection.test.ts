import { expect, test, describe } from "bun:test";
import { PluginState } from "../../src/plugin-state";

describe("PluginState pending injections", () => {
    test("tracks multiple pending injections per session", () => {
        const state = new PluginState();
        
        state.setPending("session-1", "msg-1", "part-1");
        state.setPending("session-1", "msg-2", "part-2");
        state.setPending("session-2", "msg-3", "part-3");
        
        const pending1 = state.getPendingForSession("session-1");
        expect(pending1).toHaveLength(2);
        expect(pending1.map(p => p.messageID)).toContain("msg-1");
        expect(pending1.map(p => p.messageID)).toContain("msg-2");
        
        const pending2 = state.getPendingForSession("session-2");
        expect(pending2).toHaveLength(1);
        expect(pending2[0].messageID).toBe("msg-3");
    });

    test("clears pending for session", () => {
        const state = new PluginState();
        state.setPending("session-1", "msg-1", "part-1");
        state.setPending("session-1", "msg-2", "part-2");
        
        state.clearPending("session-1");
        expect(state.getPendingForSession("session-1")).toHaveLength(0);
    });

    test("clears specific message", () => {
        const state = new PluginState();
        state.setPending("session-1", "msg-1", "part-1");
        state.setPending("session-1", "msg-2", "part-2");
        
        state.clearPending("session-1", "msg-1");
        const pending = state.getPendingForSession("session-1");
        expect(pending).toHaveLength(1);
        expect(pending[0].messageID).toBe("msg-2");
    });

    test("markProcessed removes from pending", () => {
        const state = new PluginState();
        state.setPending("session-1", "msg-1", "part-1");
        
        state.markProcessed("msg-1");
        expect(state.getPendingForSession("session-1")).toHaveLength(0);
        expect(state.isProcessed("msg-1")).toBe(true);
    });
});
