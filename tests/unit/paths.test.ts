import { expect, test, describe, spyOn, beforeEach, afterEach } from "bun:test";
import * as paths from "../../src/utils/paths";
import * as os from "node:os";

describe("paths utils", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        // Reset process.env before each test
        for (const key in process.env) {
            delete process.env[key];
        }
        Object.assign(process.env, originalEnv);
    });

    afterEach(() => {
        // Restore original process.env
        for (const key in process.env) {
            delete process.env[key];
        }
        Object.assign(process.env, originalEnv);
    });

    test("returns correct paths on linux (default)", () => {
        spyOn(os, "platform").mockReturnValue("linux");
        spyOn(os, "homedir").mockReturnValue("/home/user");
        delete process.env.XDG_DATA_HOME;
        delete process.env.XDG_CONFIG_HOME;

        expect(paths.getDataDirectory()).toBe("/home/user/.local/share/opencode");
        expect(paths.getConfigDirectory()).toBe("/home/user/.config/opencode");
    });

    test("respects XDG environment variables on linux", () => {
        spyOn(os, "platform").mockReturnValue("linux");
        process.env.XDG_DATA_HOME = "/custom/data";
        process.env.XDG_CONFIG_HOME = "/custom/config";

        expect(paths.getDataDirectory()).toBe("/custom/data/opencode");
        expect(paths.getConfigDirectory()).toBe("/custom/config/opencode");
    });

    test("returns correct paths on darwin", () => {
        spyOn(os, "platform").mockReturnValue("darwin");
        spyOn(os, "homedir").mockReturnValue("/Users/user");

        expect(paths.getDataDirectory()).toBe("/Users/user/Library/Application Support/opencode");
        expect(paths.getConfigDirectory()).toBe("/Users/user/Library/Application Support/opencode");
    });

    test("file getters return full paths", () => {
        spyOn(os, "platform").mockReturnValue("linux");
        spyOn(os, "homedir").mockReturnValue("/home/user");
        delete process.env.XDG_DATA_HOME;
        delete process.env.XDG_CONFIG_HOME;

        expect(paths.AUTH_FILE()).toBe("/home/user/.local/share/opencode/auth.json");
        expect(paths.HISTORY_FILE()).toBe("/home/user/.local/share/opencode/quota-history.json");
        expect(paths.ANTIGRAVITY_ACCOUNTS_FILE()).toBe("/home/user/.config/opencode/antigravity-accounts.json");
    });
});
