import { appendFile } from "node:fs/promises";
import { DEBUG_LOG_FILE } from "./utils/paths";
import { inspect } from "node:util";
export class Logger {
    static instance;
    debugEnabled = false;
    logPath;
    constructor() {
        this.logPath = DEBUG_LOG_FILE();
        if (process.env.OPENCODE_QUOTAS_DEBUG === "1") {
            this.debugEnabled = true;
        }
    }
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    setDebug(enabled) {
        this.debugEnabled = enabled;
    }
    debug(msg, data) {
        this.log(msg, data, true);
    }
    info(msg, data) {
        this.log(msg, data, false);
    }
    error(msg, data) {
        this.log(msg, data, false);
    }
    log(msg, data, requiresDebug) {
        if (requiresDebug && !this.debugEnabled)
            return;
        const timestamp = new Date().toISOString();
        const payload = data
            ? ` ${inspect(data, { depth: null, colors: false, breakLength: Infinity })}`
            : "";
        const logLine = `[${timestamp}] ${msg}${payload}`;
        appendFile(this.logPath, logLine + "\n").catch(() => { });
    }
}
export const logger = Logger.getInstance();
