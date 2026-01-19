import { expect, test, describe, spyOn, beforeEach, afterEach } from "bun:test";
import { HistoryService } from "../../src/services/history-service";
import { logger } from "../../src/logger";
import * as fsPromises from "node:fs/promises";
import * as fs from "node:fs";
import { type QuotaData } from "../../src/interfaces";

describe("HistoryService", () => {
    let writeFileSpy: any;
    let readFileSpy: any;
    let existsSyncSpy: any;
    let mkdirSyncSpy: any;

    beforeEach(() => {
        writeFileSpy = spyOn(fsPromises, "writeFile").mockImplementation(() => Promise.resolve());
        readFileSpy = spyOn(fsPromises, "readFile").mockImplementation(() => Promise.resolve("{}"));
        existsSyncSpy = spyOn(fs, "existsSync").mockImplementation(() => true);
        mkdirSyncSpy = spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
        spyOn(logger, "info").mockImplementation(() => undefined);
        spyOn(logger, "error").mockImplementation(() => undefined);
        spyOn(logger, "debug").mockImplementation(() => undefined);
    });

    afterEach(() => {
        writeFileSpy.mockRestore();
        readFileSpy.mockRestore();
        existsSyncSpy.mockRestore();
        mkdirSyncSpy.mockRestore();
    });

    const mockQuota: QuotaData = {
        id: "test-quota",
        providerName: "Test",
        used: 50,
        limit: 100,
        unit: "u"
    };

    test("migrates legacy format and saves versioned payload on init", async () => {
        const now = Date.now();
        const mockHistory = {
            "test-quota": [
                { timestamp: now, used: 10, limit: 100 }
            ]
        };
        readFileSpy.mockResolvedValue(JSON.stringify(mockHistory));

        const service = new HistoryService("/tmp/history.json");
        await service.init();

        expect((logger.info as any).mock.calls.some((c: any) => c[0] === "history-service:migrated" && c[1] && c[1].to === 1)).toBe(true);

        // flushSave is called during init for legacy data, so writeFile should have been invoked immediately
        expect(writeFileSpy).toHaveBeenCalled();

        const callArgs = writeFileSpy.mock.calls.find((c: any) => c[0] === "/tmp/history.json");
        expect(callArgs).toBeTruthy();
        const savedPayload = JSON.parse(callArgs[1]);
        expect(savedPayload.version).toBe(1);
        expect(savedPayload.data["test-quota"]).toHaveLength(1);

        const history = service.getHistory("test-quota", 100000);
        expect(history).toHaveLength(1);
        expect(history[0].used).toBe(10);
    });

    test("logs parse_failed when history is malformed", async () => {
        readFileSpy.mockResolvedValue("not-json");
        const service = new HistoryService("/tmp/history.json");
        await service.init();
        expect((logger.error as any).mock.calls.some((c: any) => c[0] === "history-service:parse_failed" && c[1] && c[1].path === "/tmp/history.json")).toBe(true);
        const history = service.getHistory("test-quota", 100000);
        expect(history).toHaveLength(0);
    });

    test("loads versioned history format", async () => {
        const now = Date.now();
        const mockHistory = {
            "test-quota": [
                { timestamp: now, used: 10, limit: 100 }
            ]
        };
        readFileSpy.mockResolvedValue(JSON.stringify({ version: 1, data: mockHistory }));

        const service = new HistoryService("/tmp/history.json");
        await service.init();

        const history = service.getHistory("test-quota", 100000);
        expect(history).toHaveLength(1);
        expect(history[0].used).toBe(10);
    });

    test("unsupported version logged and data is used", async () => {
        const now = Date.now();
        const mockHistory = {
            "test-quota": [
                { timestamp: now, used: 20, limit: 100 }
            ]
        };
        readFileSpy.mockResolvedValue(JSON.stringify({ version: 999, data: mockHistory }));

        const service = new HistoryService("/tmp/history.json");
        await service.init();

        expect((logger.error as any).mock.calls.some((c: any) => c[0] === "history-service:unsupported_version" && c[1] && c[1].version === 999)).toBe(true);

        const history = service.getHistory("test-quota", 100000);
        expect(history).toHaveLength(1);
        expect(history[0].used).toBe(20);
    });

    test("appends new snapshot and saves after debounce", async () => {
        const service = new HistoryService("/tmp/history.json");
        await service.init();

        await service.append([mockQuota]);

        const history = service.getHistory("test-quota", 100000);
        expect(history).toHaveLength(1);
        expect(history[0].used).toBe(50);
        
        expect(writeFileSpy).not.toHaveBeenCalled();

        await new Promise(resolve => setTimeout(resolve, 5100));
        expect(writeFileSpy).toHaveBeenCalled();
    }, { timeout: 10000 });

    test("prunes old data based on max age", async () => {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        const mockHistory = {
            "test-quota": [
                { timestamp: now - (25 * oneHour), used: 10, limit: 100 },
                { timestamp: now - (23 * oneHour), used: 20, limit: 100 }
            ]
        };
        readFileSpy.mockResolvedValue(JSON.stringify(mockHistory));

        const service = new HistoryService("/tmp/history.json");
        await service.init();
        
        await service.append([mockQuota]);

        const history = service.getHistory("test-quota", 48 * oneHour);
        
        expect(history).toHaveLength(2);
        expect(history[0].used).toBe(20);
        expect(history[1].used).toBe(50);
    });

    test("configurable max age works", async () => {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        const mockHistory = {
            "test-quota": [
                { timestamp: now - (5 * oneHour), used: 10, limit: 100 },
            ]
        };
        readFileSpy.mockResolvedValue(JSON.stringify(mockHistory));

        const service = new HistoryService("/tmp/history.json");
        await service.init();
        
        service.setMaxAge(2);

        await service.append([mockQuota]);

        const history = service.getHistory("test-quota", 48 * oneHour);
        
        expect(history).toHaveLength(1);
        expect(history[0].used).toBe(50);
    });

    test("pruneAll removes old data for all quotas", async () => {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        const mockHistory = {
            "quota-a": [
                { timestamp: now - (25 * oneHour), used: 10, limit: 100 },
                { timestamp: now - (1 * oneHour), used: 20, limit: 100 }
            ],
            "quota-b": [
                { timestamp: now - (30 * oneHour), used: 5, limit: 100 }
            ]
        };
        readFileSpy.mockResolvedValue(JSON.stringify(mockHistory));

        const service = new HistoryService("/tmp/history.json");
        await service.init();
        
        await service.pruneAll();
        
        const historyA = service.getHistory("quota-a", 48 * oneHour);
        expect(historyA).toHaveLength(1);
        expect(historyA[0].used).toBe(20);

        const historyB = service.getHistory("quota-b", 48 * oneHour);
        expect(historyB).toHaveLength(0);
    });

    describe("Reset Detection", () => {
        test("clears history when usage drops significantly (reset detected)", async () => {
            const now = Date.now();
            const oneMinute = 60 * 1000;
            
            // Simulate history with high usage
            const mockHistory = {
                "test-quota": [
                    { timestamp: now - (5 * oneMinute), used: 60, limit: 100 },
                    { timestamp: now - (4 * oneMinute), used: 70, limit: 100 },
                    { timestamp: now - (3 * oneMinute), used: 80, limit: 100 },
                ]
            };
            readFileSpy.mockResolvedValue(JSON.stringify(mockHistory));

            const service = new HistoryService("/tmp/history.json");
            await service.init();

            // Verify initial history is loaded
            let history = service.getHistory("test-quota", 10 * oneMinute);
            expect(history).toHaveLength(3);
            expect(history[2].used).toBe(80);

            // Append a new data point with significantly lower usage (simulating reset)
            // Drop from 80 to 10 = 70 point drop, which is > 20% of 100 limit
            await service.append([{
                id: "test-quota",
                providerName: "Test",
                used: 10,
                limit: 100,
                unit: "%"
            }]);

            // History should be cleared and only contain the new point
            history = service.getHistory("test-quota", 10 * oneMinute);
            expect(history).toHaveLength(1);
            expect(history[0].used).toBe(10);

            // Verify reset was logged
            expect((logger.debug as any).mock.calls.some(
                (c: any) => c[0] === "history-service:reset_detected" && 
                           c[1]?.quotaId === "test-quota"
            )).toBe(true);
        });

        test("does not clear history for small usage drops (no reset)", async () => {
            const now = Date.now();
            const oneMinute = 60 * 1000;
            
            // Simulate history with moderate usage
            const mockHistory = {
                "test-quota": [
                    { timestamp: now - (3 * oneMinute), used: 50, limit: 100 },
                ]
            };
            readFileSpy.mockResolvedValue(JSON.stringify(mockHistory));

            const service = new HistoryService("/tmp/history.json");
            await service.init();

            // Append a new data point with slightly lower usage
            // Drop from 50 to 40 = 10 point drop, which is < 20% of 100 limit
            await service.append([{
                id: "test-quota",
                providerName: "Test",
                used: 40,
                limit: 100,
                unit: "%"
            }]);

            // History should contain both points
            const history = service.getHistory("test-quota", 10 * oneMinute);
            expect(history).toHaveLength(2);
            expect(history[0].used).toBe(50);
            expect(history[1].used).toBe(40);
        });

        test("does not clear history when usage increases", async () => {
            const now = Date.now();
            const oneMinute = 60 * 1000;
            
            const mockHistory = {
                "test-quota": [
                    { timestamp: now - (3 * oneMinute), used: 30, limit: 100 },
                ]
            };
            readFileSpy.mockResolvedValue(JSON.stringify(mockHistory));

            const service = new HistoryService("/tmp/history.json");
            await service.init();

            // Append a new data point with higher usage
            await service.append([{
                id: "test-quota",
                providerName: "Test",
                used: 50,
                limit: 100,
                unit: "%"
            }]);

            // History should contain both points
            const history = service.getHistory("test-quota", 10 * oneMinute);
            expect(history).toHaveLength(2);
            expect(history[0].used).toBe(30);
            expect(history[1].used).toBe(50);
        });

        test("skips reset detection for unlimited quotas", async () => {
            const now = Date.now();
            const oneMinute = 60 * 1000;
            
            const mockHistory = {
                "unlimited-quota": [
                    { timestamp: now - (3 * oneMinute), used: 1000, limit: null },
                ]
            };
            readFileSpy.mockResolvedValue(JSON.stringify(mockHistory));

            const service = new HistoryService("/tmp/history.json");
            await service.init();

            // Append a new data point with lower usage (but unlimited, so no reset detection)
            await service.append([{
                id: "unlimited-quota",
                providerName: "Test",
                used: 100,
                limit: null,
                unit: "credits"
            }]);

            // History should contain both points since reset detection is skipped
            const history = service.getHistory("unlimited-quota", 10 * oneMinute);
            expect(history).toHaveLength(2);
        });

        test("reset detection works at exact threshold boundary", async () => {
            const now = Date.now();
            const oneMinute = 60 * 1000;
            
            // Exactly 20% drop: from 50 to 30 = 20 point drop on limit of 100
            const mockHistory = {
                "test-quota": [
                    { timestamp: now - (3 * oneMinute), used: 50, limit: 100 },
                ]
            };
            readFileSpy.mockResolvedValue(JSON.stringify(mockHistory));

            const service = new HistoryService("/tmp/history.json");
            await service.init();

            // Drop from 50 to 30 = exactly 20% of limit
            await service.append([{
                id: "test-quota",
                providerName: "Test",
                used: 30,
                limit: 100,
                unit: "%"
            }]);

            // At exactly threshold, reset should be detected
            const history = service.getHistory("test-quota", 10 * oneMinute);
            expect(history).toHaveLength(1);
            expect(history[0].used).toBe(30);
        });
    });
});
