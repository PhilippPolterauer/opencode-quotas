import { expect, test, describe, spyOn, beforeEach, afterEach, mock } from "bun:test";
import { HistoryService } from "../src/services/history-service";
import { logger } from "../src/logger";
import * as fsPromises from "node:fs/promises";
import * as fs from "node:fs";
import { type QuotaData } from "../src/interfaces";

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

    test("loads existing history on init", async () => {
        const now = Date.now();
        const mockHistory = {
            "test-quota": [
                { timestamp: now, used: 10, limit: 100 }
            ]
        };
        readFileSpy.mockResolvedValue(JSON.stringify(mockHistory));

        const service = new HistoryService("/tmp/history.json");
        await service.init();

        const history = service.getHistory("test-quota", 100000);
        expect(history).toHaveLength(1);
        expect(history[0].used).toBe(10);
    });

    test("appends new snapshot and saves after debounce", async () => {
        const service = new HistoryService("/tmp/history.json");
        await service.init();

        await service.append([mockQuota]);

        const history = service.getHistory("test-quota", 100000);
        expect(history).toHaveLength(1);
        expect(history[0].used).toBe(50);
        
        // Should not be called immediately due to debounce
        expect(writeFileSpy).not.toHaveBeenCalled();

        // Wait for debounce (5000ms + buffer)
        await new Promise(resolve => setTimeout(resolve, 5100));
        
        expect(writeFileSpy).toHaveBeenCalled();
    }, { timeout: 10000 });

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
        readFileSpy.mockResolvedValue(JSON.stringify(mockHistory));

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
        readFileSpy.mockResolvedValue(JSON.stringify(mockHistory));

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

    test("pruneAll removes old data for all quotas", async () => {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        const mockHistory = {
            "quota-a": [
                { timestamp: now - (25 * oneHour), used: 10, limit: 100 },
                { timestamp: now - (1 * oneHour), used: 20, limit: 100 }
            ],
            "quota-b": [
                { timestamp: now - (30 * oneHour), used: 5, limit: 100 } // All old
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
        
        // Ensure empty keys are removed from memory (optional but good for leaks)
        // Accessing private data for verification is tricky in TS without @ts-ignore or casting
        // We'll trust getHistory returning empty array implies data is gone or validly filtered.
    });
});
