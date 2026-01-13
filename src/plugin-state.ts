const PLUGIN_STATE_KEY = "__OPENCODE_QUOTA_PLUGIN_STATE__";

type PluginStateGlobal = {
    [PLUGIN_STATE_KEY]?: PluginState;
};

/**
 * Singleton state manager for the quota plugin.
 * Uses globalThis to ensure only one instance exists across all plugin instantiations.
 */
export class PluginState {
    private static readonly MAX_TRACKED_MESSAGES = 1000;
    private processedMessages: string[] = [];
    private processedSet = new Set<string>();
    private locks = new Map<string, Promise<void>>();

    isProcessed(messageId: string): boolean {
        return this.processedSet.has(messageId);
    }

    markProcessed(messageId: string): void {
        if (this.processedSet.has(messageId)) return;

        this.processedSet.add(messageId);
        this.processedMessages.push(messageId);

        while (this.processedMessages.length > PluginState.MAX_TRACKED_MESSAGES) {
            const oldest = this.processedMessages.shift();
            if (oldest) this.processedSet.delete(oldest);
        }
    }

    async acquireLock(messageId: string): Promise<() => void> {
        const existingLock = this.locks.get(messageId) || Promise.resolve();
        
        let resolveLock: () => void;
        const nextLock = new Promise<void>((resolve) => {
            resolveLock = resolve;
        });

        this.locks.set(messageId, nextLock);

        await existingLock;

        return () => {
            resolveLock();
            if (this.locks.get(messageId) === nextLock) {
                this.locks.delete(messageId);
            }
        };
    }
}

/**
 * Returns the global singleton PluginState instance.
 * This ensures all plugin instantiations share the same state,
 * preventing duplicate injection when the plugin is loaded multiple times.
 */
export function getPluginState(): PluginState {
    const globalRef = globalThis as PluginStateGlobal;
    if (!globalRef[PLUGIN_STATE_KEY]) {
        globalRef[PLUGIN_STATE_KEY] = new PluginState();
    }
    return globalRef[PLUGIN_STATE_KEY];
}
