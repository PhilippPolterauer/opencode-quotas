export class PluginState {
    private processedMessages = new Set<string>();
    private locks = new Map<string, Promise<void>>();

    /**
     * Check if a message has already been processed by this instance.
     */
    isProcessed(messageId: string): boolean {
        return this.processedMessages.has(messageId);
    }

    /**
     * Mark a message as processed.
     */
    markProcessed(messageId: string): void {
        this.processedMessages.add(messageId);
    }

    /**
     * Acquire a lock for a specific message ID.
     * Returns a release function.
     */
    async acquireLock(messageId: string): Promise<() => void> {
        const existingLock = this.locks.get(messageId) || Promise.resolve();
        
        let resolveLock: () => void;
        const nextLock = new Promise<void>((resolve) => {
            resolveLock = resolve;
        });

        // Set the new lock immediately to block subsequent requests
        this.locks.set(messageId, nextLock);

        // Wait for the previous lock to finish
        await existingLock;

        return () => {
            resolveLock();
            // Only delete from the map if we are still the current lock
            if (this.locks.get(messageId) === nextLock) {
                this.locks.delete(messageId);
            }
        };
    }
}
