import { expect, test, describe, spyOn, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import { createCodexProvider } from "../../src/providers/codex";
import { AUTH_FILE, ANTIGRAVITY_ACCOUNTS_FILE } from "../../src/utils/paths";

describe("Codex auth file handling", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        // Reset environment and ensure deterministic paths
        for (const key in process.env) delete process.env[key];
        Object.assign(process.env, originalEnv);
        spyOn(os, "platform").mockReturnValue("linux");
        spyOn(os, "homedir").mockReturnValue("/home/user");
    });

    afterEach(() => {
        // Restore fs mocks if any
        if ((fs.readFile as any).mockRestore) (fs.readFile as any).mockRestore();
    });

    test("throws when auth.json missing and does not fallback to antigravity file", async () => {
        const authPath = AUTH_FILE();
        const antigravityPath = ANTIGRAVITY_ACCOUNTS_FILE();

        const readSpy: any = spyOn(fs, "readFile").mockImplementation((p: string) => {
            if (p === authPath) return Promise.reject({ code: "ENOENT" });
            return Promise.reject(new Error("should not be called"));
        });

        const provider = createCodexProvider();
        await expect(provider.fetchQuota()).rejects.toThrow("Codex auth.json not found");

        expect(readSpy).toHaveBeenCalled();
        expect(readSpy.mock.calls.length).toBe(1);
        expect(readSpy.mock.calls[0][0]).toBe(authPath);
        expect(readSpy.mock.calls[0][0]).not.toBe(antigravityPath);
    });

    test("reads auth.json and uses oauth credentials to fetch quota", async () => {
        const authPath = AUTH_FILE();
        const mockAuth = JSON.stringify({ codex: { type: "oauth", access: "token-123" } });

        spyOn(fs, "readFile").mockResolvedValue(mockAuth);

        const mockFetch = spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    rate_limit: { primary_window: { used_percent: 25 } },
                }),
                { status: 200 },
            ),
        );

        const provider = createCodexProvider();
        const results = await provider.fetchQuota();

        expect(mockFetch).toHaveBeenCalled();
        expect(results.length).toBeGreaterThan(0);
        expect(results.find((r) => r.id === "codex-primary")).toBeDefined();

        mockFetch.mockRestore();
    });
});
