import { logger } from "../logger";

/**
 * Shared helper for debugging to ~/.local/share/opencode/quotas-debug.log
 * @deprecated Use logger directly instead
 */
export function logToDebugFile(msg: string, data: any, enabled: boolean) {
    if (enabled) {
        logger.debug(msg, data);
    } else {
        // Legacy behavior: if enabled was false, we didn't log.
        // But if it's an error/important, maybe we should? 
        // For now, respect the 'enabled' flag as strictly debug-only check.
    }
}
