import { expect, test, describe, beforeEach } from "bun:test";
import { QuotaHubPlugin } from "../../src/index";

describe("Concurrency Integration", () => {
    let mockClient: any;
    let mockContext: any;
    let processTaskCount = 0;

    beforeEach(() => {
        processTaskCount = 0;
        mockClient = {
            session: {
                message: async () => {
                    // Add a small delay to yield the event loop and simulate real work
                    await new Promise(resolve => setTimeout(resolve, 10));
                    processTaskCount++;
                    return {
                        data: {
                            info: {
                                role: "assistant",
                                mode: "normal",
                                finish: "stop",
                                providerID: "test-provider",
                                modelID: "test-model"
                            },
                            parts: []
                        }
                    };
                }
            }
        };
        mockContext = {
            client: mockClient,
            $: {} as any,
            directory: "/tmp"
        };
    });

    test("Race Condition Simulation: Multiple parallel calls result in single processing", async () => {
        const hooks = await QuotaHubPlugin(mockContext);
        const hook = hooks["experimental.text.complete"];

        if (!hook) throw new Error("Hook not found");

        const input = {
            sessionID: "session-1",
            messageID: "message-1",
            partID: "part-1"
        };
        const output = { text: "Hello world" };

        // Spawn 10 parallel calls
        const calls: Promise<any>[] = [];
        for (let i = 0; i < 10; i++) {
            calls.push(hook(input, output));
        }
        await Promise.all(calls);

        // Verify that client.session.message was called exactly once for this messageID
        expect(processTaskCount).toBe(1);
        
        // Check if footer was added exactly once (or at least present)
        // Since we markProcessed before the quota check, it should reach the end
        // IF we have quotas. But here we might not have them.
        // The important thing is processTaskCount is 1.
    });
});
