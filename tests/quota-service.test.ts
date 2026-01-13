import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { QuotaService } from "../src/services/quota-service";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

describe("QuotaService", () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), "opencode-quotas-test-"));
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    test("loads default configuration when no file exists", async () => {
        const service = new QuotaService();
        await service.init(tempDir);

        const config = service.getConfig();
        expect(config.footer).toBe(true);
        expect(config.displayMode).toBe("simple");
    });

    test("merges user configuration from .opencode/quotas.json", async () => {
        const opencodeDir = join(tempDir, ".opencode");
        await fs.mkdir(opencodeDir, { recursive: true });
        
        await fs.writeFile(join(opencodeDir, "quotas.json"), JSON.stringify({
            footer: false,
            debug: true,
            disabled: ["test-quota"]
        }));

        const service = new QuotaService();
        await service.init(tempDir);

        const config = service.getConfig();
        expect(config.footer).toBe(false);
        expect(config.debug).toBe(true);
        expect(config.disabled).toContain("test-quota");
    });

    test("filters quotas by current model when filterByCurrentModel is enabled", () => {
        const service = new QuotaService({
            filterByCurrentModel: true,
            showUnaggregated: true
        });

        const mockData = [
            { id: "quota-flash", providerName: "Flash Model", used: 10, limit: 100, unit: "u" },
            { id: "quota-pro", providerName: "Pro Model", used: 20, limit: 100, unit: "u" },
        ];

        const filtered = service.processQuotas(mockData, {
            providerId: "provider",
            modelId: "flash-v2"
        });

        // Should match "flash" token in quota-flash
        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe("quota-flash");
    });

    test("filters disabled quotas", () => {
        const service = new QuotaService({
            disabled: ["quota-2"],
            showUnaggregated: true
        });

        const mockData = [
            { id: "quota-1", providerName: "A", used: 10, limit: 100, unit: "u" },
            { id: "quota-2", providerName: "B", used: 20, limit: 100, unit: "u" },
        ];

        const filtered = service.processQuotas(mockData);

        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe("quota-1");
    });

    test("invalid pollingInterval in config falls back to default", async () => {
        const opencodeDir = join(tempDir, ".opencode");
        await fs.mkdir(opencodeDir, { recursive: true });
        await fs.writeFile(join(opencodeDir, "quotas.json"), JSON.stringify({ pollingInterval: "invalid" }));

        const service = new QuotaService();
        await service.init(tempDir);

        const config = service.getConfig();
        expect(config.pollingInterval).toBe(require("../src/defaults").DEFAULT_CONFIG.pollingInterval);
    });
});
