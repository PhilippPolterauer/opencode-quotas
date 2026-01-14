const PLUGIN_STATE_KEY = "__OPENCODE_QUOTA_PLUGIN_STATE__";

type PluginStateGlobal = {
    [PLUGIN_STATE_KEY]?: PluginState;
};

type PendingInjection = {
    sessionID: string;
    messageID: string;
    partID: string;
    createdAt: number;
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
    private pendingBySession = new Map<string, PendingInjection>();
    private pendingMessages = new Set<string>();
    private recentChecks = new Map<string, number>();

    isProcessed(messageId: string): boolean {
        return this.processedSet.has(messageId);
    }

    isPending(messageId: string): boolean {
        return this.pendingMessages.has(messageId);
    }

    setPending(sessionID: string, messageID: string, partID: string): void {
        const existing = this.pendingBySession.get(sessionID);
        if (existing && existing.messageID !== messageID) {
            this.pendingMessages.delete(existing.messageID);
        }

        this.pendingBySession.set(sessionID, {
            sessionID,
            messageID,
            partID,
            createdAt: Date.now(),
        });
        this.pendingMessages.add(messageID);
    }

    getPending(sessionID: string): PendingInjection | undefined {
        return this.pendingBySession.get(sessionID);
    }

    clearPending(sessionID: string): void {
        const existing = this.pendingBySession.get(sessionID);
        if (!existing) return;

        this.pendingMessages.delete(existing.messageID);
        this.pendingBySession.delete(sessionID);
    }

    markProcessed(messageId: string): void {
        if (this.processedSet.has(messageId)) return;

        this.processedSet.add(messageId);
        this.processedMessages.push(messageId);
        if (this.pendingMessages.has(messageId)) {
            this.pendingMessages.delete(messageId);
            for (const [sessionID, pending] of this.pendingBySession) {
                if (pending.messageID === messageId) {
                    this.pendingBySession.delete(sessionID);
                    break;
                }
            }
        }

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
