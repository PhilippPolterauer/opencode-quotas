import { expect, test, describe, spyOn, beforeEach, afterEach } from "bun:test";
import * as auth from "../../src/providers/antigravity/auth";
import * as fs from "node:fs/promises";

// We need to mock the global fetch
const originalFetch = globalThis.fetch;

describe("Antigravity Auth", () => {
    beforeEach(() => {
        auth.resetCredentialCache();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        // Restore all fs mocks
        if ((fs.readFile as any).mockRestore) {
            (fs.readFile as any).mockRestore();
        }
    });

    describe("hasCloudCredentials", () => {
        test("returns true when accounts file exists and is valid", async () => {
            spyOn(fs, "readFile").mockResolvedValue(JSON.stringify({
                version: 1,
                accounts: [{ email: "test@example.com", refreshToken: "abc", addedAt: 0, lastUsed: 0 }],
                activeIndex: 0
            }));

            const result = await auth.hasCloudCredentials();
            expect(result).toBe(true);
        });

        test("returns false when accounts file is missing", async () => {
            spyOn(fs, "readFile").mockRejectedValue({ code: "ENOENT" });

            const result = await auth.hasCloudCredentials();
            expect(result).toBe(false);
        });
    });

    describe("getCloudCredentials", () => {
        test("refreshes token when cache is empty", async () => {
            // Mock file read
            spyOn(fs, "readFile").mockResolvedValue(JSON.stringify({
                version: 1,
                accounts: [{ email: "test@example.com", refreshToken: "refresh-token", addedAt: 0, lastUsed: 0 }],
                activeIndex: 0
            }));

            // Mock fetch for token refresh
            globalThis.fetch = (async (url: string) => {
                if (url.includes("oauth2.googleapis.com/token")) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: "new-access-token",
                            expires_in: 3600,
                            token_type: "Bearer"
                        })
                    } as Response;
                }
                return { ok: false } as Response;
            }) as any;

            const creds = await auth.getCloudCredentials();
            expect(creds.accessToken).toBe("new-access-token");
            expect(creds.email).toBe("test@example.com");
        });

        test("throws helpful error when refresh token is invalid", async () => {
             spyOn(fs, "readFile").mockResolvedValue(JSON.stringify({
                version: 1,
                accounts: [{ email: "different@example.com", refreshToken: "bad-token", addedAt: 0, lastUsed: 0 }],
                activeIndex: 0
            }));

            globalThis.fetch = (async () => ({
                ok: false,
                status: 400,
                text: async () => "invalid_grant"
            })) as any;

            await expect(auth.getCloudCredentials()).rejects.toThrow("Refresh token is invalid or expired");
        });
    });
});
