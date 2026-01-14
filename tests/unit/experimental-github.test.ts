import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { ConfigLoader } from "../../src/services/config-loader";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

describe("Experimental GitHub config", () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), "opencode-quotas-config-test-"));
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    test("merges enableExperimentalGithub from user config", async () => {
        const opencodeDir = join(tempDir, ".opencode");
        await fs.mkdir(opencodeDir, { recursive: true });
        await fs.writeFile(join(opencodeDir, "quotas.json"), JSON.stringify({ enableExperimentalGithub: true }));

        const initialConfig = ConfigLoader.createConfig();
        const result = await ConfigLoader.loadFromDisk(tempDir, initialConfig);

        expect(result.enableExperimentalGithub).toBe(true);
    });
});