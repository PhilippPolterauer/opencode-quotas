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

    test("processes quotas with model mapping", () => {
        const service = new QuotaService({
            modelMapping: {
                "prov:mod": ["quota-1"]
            }
        });

        const mockData = [
            { id: "quota-1", providerName: "A", used: 10, limit: 100, unit: "u" },
            { id: "quota-2", providerName: "B", used: 20, limit: 100, unit: "u" },
        ];

        const filtered = service.processQuotas(mockData, {
            providerId: "prov",
            modelId: "mod"
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe("quota-1");
    });

    test("filters disabled quotas", () => {
        const service = new QuotaService({
            disabled: ["quota-2"]
        });

        const mockData = [
            { id: "quota-1", providerName: "A", used: 10, limit: 100, unit: "u" },
            { id: "quota-2", providerName: "B", used: 20, limit: 100, unit: "u" },
        ];

        const filtered = service.processQuotas(mockData);

        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe("quota-1");
    });
});
