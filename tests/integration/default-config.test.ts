import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { QuotaService } from "../../src/services/quota-service";
import { DEFAULT_CONFIG } from "../../src/defaults";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

describe("Default Configuration", () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), "opencode-quotas-default-test-"));
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    test("should match documented defaults", async () => {
        const service = new QuotaService();
        await service.init(tempDir);
        const config = service.getConfig();

        // Verify defaults match what is currently implemented in src/defaults.ts
        // and check against README expectations.
        expect(config.filterByCurrentModel).toBe(false);
        expect(config.showUnaggregated).toBe(true);
        expect(config.footer).toBe(true);
        expect(config.debug).toBe(false);
        expect(config.pollingInterval).toBe(60000);
        
        // Match README: Default is false (changed from true)
        expect(config.progressBar?.color).toBe(false);
        
        // Match new predictionWindowMinutes default
        expect(config.predictionWindowMinutes).toBe(60);
        expect(config.predictionShortWindowMinutes).toBe(5);
        
        // Table defaults
        expect(config.table?.header).toBe(true);
    });

    test("should have expected default aggregated groups", async () => {
        const service = new QuotaService();
        await service.init(tempDir);
        const config = service.getConfig();

        const groups = config.aggregatedGroups || [];
        
        // Verify we have the 4 standard groups documented in README
        expect(groups).toHaveLength(4);
        
        const ids = groups.map(g => g.id);
        expect(ids).toContain("ag-flash");
        expect(ids).toContain("ag-pro");
        expect(ids).toContain("ag-premium");
        expect(ids).toContain("codex-smart");

        // Verify one group in detail
        const flashGroup = groups.find(g => g.id === "ag-flash");
        expect(flashGroup?.name).toBe("Antigravity Flash");
        expect(flashGroup?.providerId).toBe("antigravity");
        expect(flashGroup?.strategy).toBe("most_critical");
    });

    test("should display aggregated groups by default", async () => {
        const service = new QuotaService();
        await service.init(tempDir);
        
        // Mock data that should be aggregated
        const mockData = [
            { id: "ag-raw-flash-1", providerName: "Antigravity", used: 10, limit: 100, unit: "tokens" },
            { id: "ag-raw-flash-2", providerName: "Antigravity", used: 20, limit: 100, unit: "tokens" },
            { id: "codex-primary", providerName: "Codex", used: 5, limit: 50, unit: "requests" },
            { id: "codex-secondary", providerName: "Codex", used: 0, limit: 50, unit: "requests" },
            { id: "unrelated-quota", providerName: "Other", used: 1, limit: 10, unit: "units" }
        ];

        const processed = service.processQuotas(mockData);

        // ag-raw-flash-1 and ag-raw-flash-2 should be aggregated into ag-flash
        // codex-primary and codex-secondary should be aggregated into codex-smart
        // unrelated-quota should remain because showUnaggregated is true by default
        
        const ids = processed.map(q => q.id);
        expect(ids).toContain("ag-flash");
        expect(ids).toContain("codex-smart");
        expect(ids).toContain("unrelated-quota");
        
        // Verify no raw source quotas are left (except unrelated-quota)
        expect(ids).not.toContain("ag-raw-flash-1");
        expect(ids).not.toContain("ag-raw-flash-2");
        expect(ids).not.toContain("codex-primary");
        expect(ids).not.toContain("codex-secondary");
    });
});
