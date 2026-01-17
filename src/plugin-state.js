const PLUGIN_STATE_KEY = "__OPENCODE_QUOTA_PLUGIN_STATE__";
/**
 * Singleton state manager for the quota plugin.
 * Uses globalThis to ensure only one instance exists across all plugin instantiations.
 */
export class PluginState {
    static MAX_TRACKED_MESSAGES = 1000;
    processedMessages = [];
    processedSet = new Set();
    locks = new Map();
    pendingBySession = new Map();
    pendingMessages = new Set();
    recentChecks = new Map();
    isProcessed(messageId) {
        return this.processedSet.has(messageId);
    }
    isPending(messageId) {
        return this.pendingMessages.has(messageId);
    }
    setPending(sessionID, messageID, partID) {
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
    getPending(sessionID) {
        return this.pendingBySession.get(sessionID);
    }
    clearPending(sessionID) {
        const existing = this.pendingBySession.get(sessionID);
        if (!existing)
            return;
        this.pendingMessages.delete(existing.messageID);
        this.pendingBySession.delete(sessionID);
    }
    markProcessed(messageId) {
        if (this.processedSet.has(messageId))
            return;
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
            if (oldest)
                this.processedSet.delete(oldest);
        }
    }
    async acquireLock(messageId) {
        const existingLock = this.locks.get(messageId) || Promise.resolve();
        let resolveLock;
        const nextLock = new Promise((resolve) => {
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
export function getPluginState() {
    const globalRef = globalThis;
    if (!globalRef[PLUGIN_STATE_KEY]) {
        globalRef[PLUGIN_STATE_KEY] = new PluginState();
    }
    return globalRef[PLUGIN_STATE_KEY];
}
