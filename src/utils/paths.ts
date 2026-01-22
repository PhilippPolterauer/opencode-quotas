import { homedir, platform } from "node:os";
import { join } from "node:path";

export function getDataDirectory(): string {
    const home = homedir();

    switch (platform()) {
        case "win32":
            return process.env.APPDATA
                ? join(process.env.APPDATA, "opencode")
                : join(home, "AppData", "Roaming", "opencode");
        default:
            // macOS and Linux both use XDG-style paths
            // OpenCode stores data in ~/.local/share/opencode/ on all Unix systems
            return process.env.XDG_DATA_HOME
                ? join(process.env.XDG_DATA_HOME, "opencode")
                : join(home, ".local", "share", "opencode");
    }
}

export function getConfigDirectory(): string {
    const home = homedir();

    switch (platform()) {
        case "win32":
            return process.env.APPDATA
                ? join(process.env.APPDATA, "opencode")
                : join(home, "AppData", "Roaming", "opencode");
        default:
            // macOS and Linux both use XDG-style paths
            // OpenCode stores config in ~/.config/opencode/ on all Unix systems
            return process.env.XDG_CONFIG_HOME
                ? join(process.env.XDG_CONFIG_HOME, "opencode")
                : join(home, ".config", "opencode");
    }
}

export const AUTH_FILE = (): string => join(getDataDirectory(), "auth.json");
export const HISTORY_FILE = (): string => join(getDataDirectory(), "quota-history.json");
export const DEBUG_LOG_FILE = (): string => join(getDataDirectory(), "quotas-debug.log");
export const ANTIGRAVITY_ACCOUNTS_FILE = (): string => join(getConfigDirectory(), "antigravity-accounts.json");
