import { homedir, platform } from "node:os";
import { join } from "node:path";
export function getDataDirectory() {
    const home = homedir();
    switch (platform()) {
        case "win32":
            return process.env.APPDATA
                ? join(process.env.APPDATA, "opencode")
                : join(home, "AppData", "Roaming", "opencode");
        case "darwin":
            return join(home, "Library", "Application Support", "opencode");
        default:
            return process.env.XDG_DATA_HOME
                ? join(process.env.XDG_DATA_HOME, "opencode")
                : join(home, ".local", "share", "opencode");
    }
}
export function getConfigDirectory() {
    const home = homedir();
    switch (platform()) {
        case "win32":
            return process.env.APPDATA
                ? join(process.env.APPDATA, "opencode")
                : join(home, "AppData", "Roaming", "opencode");
        case "darwin":
            return join(home, "Library", "Application Support", "opencode");
        default:
            return process.env.XDG_CONFIG_HOME
                ? join(process.env.XDG_CONFIG_HOME, "opencode")
                : join(home, ".config", "opencode");
    }
}
export const AUTH_FILE = () => join(getDataDirectory(), "auth.json");
export const HISTORY_FILE = () => join(getDataDirectory(), "quota-history.json");
export const DEBUG_LOG_FILE = () => join(getDataDirectory(), "quotas-debug.log");
export const ANTIGRAVITY_ACCOUNTS_FILE = () => join(getConfigDirectory(), "antigravity-accounts.json");
