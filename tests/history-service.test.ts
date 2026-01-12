import { expect, test, describe, spyOn, beforeEach, afterEach } from "bun:test";
import { HistoryService } from "../src/services/history-service";
import * as fs from "node:fs";
import { type QuotaData } from "../src/interfaces";

describe("HistoryService", () => {
    let writeFileSyncSpy: any;
    let readFileSyncSpy: any;
    let existsSyncSpy: any;
    let mkdirSyncSpy: any;

    beforeEach(() => {
        writeFileSyncSpy = spyOn(fs, "writeFileSync").mockImplementation(() => {});
        readFileSyncSpy = spyOn(fs, "readFileSync").mockImplementation(() => "{}");
        existsSyncSpy = spyOn(fs, "existsSync").mockImplementation(() => true);
        mkdirSyncSpy = spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    });

    afterEach(() => {
        writeFileSyncSpy.mockRestore();
        readFileSyncSpy.mockRestore();
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

    test("loads existing history on init", async () => {
        const now = Date.now();
        const mockHistory = {
            "test-quota": [
                { timestamp: now, used: 10, limit: 100 }
            ]
        };
        readFileSyncSpy.mockReturnValue(JSON.stringify(mockHistory));

        const service = new HistoryService("/tmp/history.json");
        await service.init();

        const history = service.getHistory("test-quota", 100000);
        expect(history).toHaveLength(1);
        expect(history[0].used).toBe(10);
    });

    test("appends new snapshot", async () => {
        const service = new HistoryService("/tmp/history.json");
        await service.init();

        await service.append([mockQuota]);

        const history = service.getHistory("test-quota", 100000);
        expect(history).toHaveLength(1);
        expect(history[0].used).toBe(50);
        expect(writeFileSyncSpy).toHaveBeenCalled();
    });

    test("prunes old data based on max age", async () => {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        // Mock existing old data
        const mockHistory = {
            "test-quota": [
                { timestamp: now - (25 * oneHour), used: 10, limit: 100 }, // 25 hours old (should be pruned)
                { timestamp: now - (23 * oneHour), used: 20, limit: 100 }  // 23 hours old (should be kept)
            ]
        };
        readFileSyncSpy.mockReturnValue(JSON.stringify(mockHistory));

        const service = new HistoryService("/tmp/history.json");
        // Default max age is 24h
        await service.init();
        
        // Append triggers pruning
        await service.append([mockQuota]); // Current timestamp

        const history = service.getHistory("test-quota", 48 * oneHour); // Get all remaining
        
        // Should have the 23h old point + the new point
        expect(history).toHaveLength(2);
        expect(history[0].used).toBe(20);
        expect(history[1].used).toBe(50);
    });

    test("configurable max age works", async () => {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        const mockHistory = {
            "test-quota": [
                { timestamp: now - (5 * oneHour), used: 10, limit: 100 }, // 5 hours old
            ]
        };
        readFileSyncSpy.mockReturnValue(JSON.stringify(mockHistory));

        const service = new HistoryService("/tmp/history.json");
        await service.init();
        
        // Set max age to 2 hours
        service.setMaxAge(2);

        // Append triggers pruning
        await service.append([mockQuota]);

        const history = service.getHistory("test-quota", 48 * oneHour);
        
        // The 5h old point should be gone, only the new one remains
        expect(history).toHaveLength(1);
        expect(history[0].used).toBe(50);
    });
});
