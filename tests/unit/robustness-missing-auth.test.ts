import { expect, test, describe, beforeAll, afterAll, spyOn } from "bun:test";
import { QuotaService } from "../../src/services/quota-service";
import * as agAuth from "../../src/providers/antigravity/auth";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

describe("Robustness: Missing Auth Configuration", () => {
    let service: QuotaService;
    let tempHome: string;
    let originalXdgData: string | undefined;
    let originalXdgConfig: string | undefined;
    let authSpy: any;

    beforeAll(async () => {
        // Create a temp directory to act as "HOME" / Data dir
        tempHome = await mkdtemp(join(tmpdir(), "opencode-quotas-test-"));
        
        // Redirect paths via environment variables
        originalXdgData = process.env.XDG_DATA_HOME;
        originalXdgConfig = process.env.XDG_CONFIG_HOME;
        
        process.env.XDG_DATA_HOME = tempHome;
        process.env.XDG_CONFIG_HOME = tempHome;

        // Spy on Antigravity auth to simulate failure without persistent mocking
        authSpy = spyOn(agAuth, "getCloudCredentials").mockRejectedValue(new Error("ADC credentials not found"));

        // Initialize service
        service = new QuotaService({ 
            debug: true,
            footer: false 
        });
        
        // Init with the temp dir as the config directory
        await service.init(tempHome);
    });

    afterAll(async () => {
        // Restore environment
        if (originalXdgData) process.env.XDG_DATA_HOME = originalXdgData;
        else delete process.env.XDG_DATA_HOME;

        if (originalXdgConfig) process.env.XDG_CONFIG_HOME = originalXdgConfig;
        else delete process.env.XDG_CONFIG_HOME;

        // Restore spy
        authSpy.mockRestore();

        // Cleanup temp dir
        await rm(tempHome, { recursive: true, force: true });
    });

    test("QuotaService initializes without throwing", () => {
        expect(service).toBeDefined();
        const providers = service.getProviders();
        expect(providers.length).toBeGreaterThan(0);
    });

    test("getQuotas returns empty array when all providers fail", async () => {
        const quotas = await service.getQuotas();
        expect(Array.isArray(quotas)).toBe(true);
        expect(quotas.length).toBe(0);
    });

    test("AggregatedGroups handles missing source data gracefully", async () => {
        const quotas = await service.getQuotas();
        
        // Ensure no partial/broken groups are returned
        const groupIds = ["ag-flash", "codex-smart", "ag-pro"];
        for (const id of groupIds) {
            const group = quotas.find(q => q.id === id);
            expect(group).toBeUndefined();
        }
    });
});
