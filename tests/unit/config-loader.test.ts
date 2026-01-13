import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { ConfigLoader } from "../../src/services/config-loader";
import { DEFAULT_CONFIG } from "../../src/defaults";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

describe("ConfigLoader", () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), "opencode-quotas-config-test-"));
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    describe("createConfig", () => {
        test("returns default config when no initial config provided", () => {
            const config = ConfigLoader.createConfig();
            expect(config.displayMode).toBe(DEFAULT_CONFIG.displayMode);
            expect(config.footer).toBe(DEFAULT_CONFIG.footer);
            expect(config.debug).toBe(DEFAULT_CONFIG.debug);
        });

        test("merges initial config with defaults", () => {
            const config = ConfigLoader.createConfig({
                footer: false,
                debug: true,
            });
            expect(config.footer).toBe(false);
            expect(config.debug).toBe(true);
            expect(config.displayMode).toBe(DEFAULT_CONFIG.displayMode);
        });

        test("deep clones progressBar config", () => {
            const config = ConfigLoader.createConfig({
                progressBar: { color: false },
            });
            expect(config.progressBar?.color).toBe(false);
            // Should still have other progressBar defaults
            expect(config.progressBar?.gradients).toEqual(DEFAULT_CONFIG.progressBar?.gradients);
        });

        test("merges aggregatedGroups arrays", () => {
            const customGroup = {
                id: "custom",
                name: "Custom Group",
                sources: ["a", "b"],
            };
            const config = ConfigLoader.createConfig({
                aggregatedGroups: [customGroup],
            });
            // Should have default groups plus custom group
            expect(config.aggregatedGroups?.length).toBeGreaterThan(1);
            expect(config.aggregatedGroups).toContainEqual(customGroup);
        });
    });

    describe("loadFromDisk", () => {
        test("returns unchanged config when no file exists", async () => {
            const initialConfig = ConfigLoader.createConfig();
            const result = await ConfigLoader.loadFromDisk(tempDir, initialConfig);
            
            expect(result.footer).toBe(initialConfig.footer);
            expect(result.debug).toBe(initialConfig.debug);
        });

        test("merges user config from disk", async () => {
            const opencodeDir = join(tempDir, ".opencode");
            await fs.mkdir(opencodeDir, { recursive: true });
            await fs.writeFile(
                join(opencodeDir, "quotas.json"),
                JSON.stringify({
                    footer: false,
                    debug: true,
                    disabled: ["test-quota"],
                })
            );

            const initialConfig = ConfigLoader.createConfig();
            const result = await ConfigLoader.loadFromDisk(tempDir, initialConfig);

            expect(result.footer).toBe(false);
            expect(result.debug).toBe(true);
            expect(result.disabled).toContain("test-quota");
        });

        test("validates pollingInterval from user config", async () => {
            const opencodeDir = join(tempDir, ".opencode");
            await fs.mkdir(opencodeDir, { recursive: true });
            await fs.writeFile(
                join(opencodeDir, "quotas.json"),
                JSON.stringify({ pollingInterval: 30000 })
            );

            const initialConfig = ConfigLoader.createConfig();
            const result = await ConfigLoader.loadFromDisk(tempDir, initialConfig);

            expect(result.pollingInterval).toBe(30000);
        });

        test("resets invalid pollingInterval to default", async () => {
            const opencodeDir = join(tempDir, ".opencode");
            await fs.mkdir(opencodeDir, { recursive: true });
            await fs.writeFile(
                join(opencodeDir, "quotas.json"),
                JSON.stringify({ pollingInterval: "invalid" })
            );

            const initialConfig = ConfigLoader.createConfig();
            const result = await ConfigLoader.loadFromDisk(tempDir, initialConfig);

            expect(result.pollingInterval).toBe(DEFAULT_CONFIG.pollingInterval);
        });

        test("respects OPENCODE_QUOTAS_CONFIG_PATH environment variable", async () => {
            // Create custom config path
            const customConfigPath = join(tempDir, "custom-config.json");
            await fs.writeFile(
                customConfigPath,
                JSON.stringify({ footer: false })
            );

            // Set environment variable
            const originalEnv = process.env.OPENCODE_QUOTAS_CONFIG_PATH;
            process.env.OPENCODE_QUOTAS_CONFIG_PATH = customConfigPath;

            try {
                const initialConfig = ConfigLoader.createConfig();
                const result = await ConfigLoader.loadFromDisk(tempDir, initialConfig);
                expect(result.footer).toBe(false);
            } finally {
                // Restore environment
                if (originalEnv !== undefined) {
                    process.env.OPENCODE_QUOTAS_CONFIG_PATH = originalEnv;
                } else {
                    delete process.env.OPENCODE_QUOTAS_CONFIG_PATH;
                }
            }
        });

        test("handles JSON parse errors gracefully", async () => {
            const opencodeDir = join(tempDir, ".opencode");
            await fs.mkdir(opencodeDir, { recursive: true });
            await fs.writeFile(
                join(opencodeDir, "quotas.json"),
                "{ invalid json }"
            );

            const initialConfig = ConfigLoader.createConfig();
            const result = await ConfigLoader.loadFromDisk(tempDir, initialConfig);

            // Should return config with defaults
            expect(result.footer).toBe(initialConfig.footer);
        });

        test("merges filterByCurrentModel from user config", async () => {
            const opencodeDir = join(tempDir, ".opencode");
            await fs.mkdir(opencodeDir, { recursive: true });
            await fs.writeFile(
                join(opencodeDir, "quotas.json"),
                JSON.stringify({
                    filterByCurrentModel: true
                })
            );

            const initialConfig = ConfigLoader.createConfig();
            const result = await ConfigLoader.loadFromDisk(tempDir, initialConfig);

            expect(result.filterByCurrentModel).toBe(true);
        });

        test("merges table config from user config", async () => {
            const opencodeDir = join(tempDir, ".opencode");
            await fs.mkdir(opencodeDir, { recursive: true });
            await fs.writeFile(
                join(opencodeDir, "quotas.json"),
                JSON.stringify({
                    table: {
                        columns: ["name", "bar", "percent"],
                        header: false
                    }
                })
            );

            const initialConfig = ConfigLoader.createConfig();
            const result = await ConfigLoader.loadFromDisk(tempDir, initialConfig);

            expect(result.table?.columns).toEqual(["name", "bar", "percent"]);
            expect(result.table?.header).toBe(false);
        });
    });
});
