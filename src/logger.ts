import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { inspect } from "node:util";
import { DEBUG_LOG_FILENAME } from "./constants";

export class Logger {
    private static instance: Logger;
    private debugEnabled: boolean = false;
    private logPath: string;

    private constructor() {
        this.logPath = join(homedir(), ".local", "share", "opencode", DEBUG_LOG_FILENAME);
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    public setDebug(enabled: boolean): void {
        this.debugEnabled = enabled;
    }

    public debug(msg: string, data?: any): void {
        this.log(msg, data, true);
    }

    public info(msg: string, data?: any): void {
        this.log(msg, data, false);
    }

    public error(msg: string, data?: any): void {
        this.log(msg, data, false);
    }

    private log(msg: string, data: any, requiresDebug: boolean): void {
        if (requiresDebug && !this.debugEnabled) return;

        const timestamp = new Date().toISOString();
        const payload = data ? ` ${inspect(data, { depth: null, colors: false, breakLength: Infinity })}` : "";
        const logLine = `[${timestamp}] ${msg}${payload}`;
        
        appendFile(this.logPath, logLine + "\n").catch(() => {});
    }
}

export const logger = Logger.getInstance();
