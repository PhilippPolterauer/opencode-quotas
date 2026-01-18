import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ANTIGRAVITY_ACCOUNTS_FILE, AUTH_FILE, DEBUG_LOG_FILE } from "../../src/utils/paths";

function isTruthy(value: string | undefined): boolean {
    if (!value) return false;
    return ["1", "true", "yes"].includes(value.toLowerCase());
}

async function waitForLogEntry(
    logPath: string,
    offset: number,
    pattern: RegExp,
    timeoutMs: number,
): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const contents = await readFile(logPath, "utf8").catch(() => "");
        const delta = contents.slice(offset);
        if (pattern.test(delta)) {
            return delta;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return null;
}

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const opencodeConfigPath = join(repoRoot, ".opencode", "opencode.jsonc");

const e2eEnabled = isTruthy(process.env.OPENCODE_QUOTAS_E2E);
const opencodePath = Bun.which("opencode");
const hasAuth = existsSync(AUTH_FILE()) || existsSync(ANTIGRAVITY_ACCOUNTS_FILE());
const shouldRun = e2eEnabled && Boolean(opencodePath) && hasAuth;

describe("E2E Injection", () => {
    if (!shouldRun) {
        const reasonParts = [
            e2eEnabled ? null : "OPENCODE_QUOTAS_E2E=1 not set",
            opencodePath ? null : "opencode CLI not found",
            hasAuth ? null : "no Opencode auth files found",
        ].filter(Boolean) as string[];
        const reason = reasonParts.length > 0 ? reasonParts.join(", ") : "unavailable";
        test.skip(`injects quota footer via opencode run (${reason})`, () => {});
        return;
    }

    test(
        "injects quota footer via opencode run",
        async () => {
            const tempDir = await mkdtemp(join(tmpdir(), "opencode-quotas-e2e-"));
            const logPath = DEBUG_LOG_FILE();
            const logBefore = await readFile(logPath, "utf8").catch(() => "");
            const configPath = join(tempDir, "quotas.json");
            await writeFile(
                configPath,
                JSON.stringify({ debug: true, footer: true, showUnaggregated: true }),
                "utf8",
            );

            const env = {
                ...process.env,
                OPENCODE_QUOTAS_CONFIG_PATH: configPath,
                OPENCODE_QUOTAS_DEBUG: "1",
                OPENCODE_CONFIG_PATH: opencodeConfigPath,
            };

            try {
                const command = opencodePath ?? "opencode";
                const proc = Bun.spawn(
                    [
                        command,
                        "run",
                        "--model",
                        "google/antigravity-gemini-3-flash",
                        "say hi",
                    ],
                    {
                        cwd: repoRoot,
                        env,
                        stdin: "ignore",
                        stdout: "pipe",
                        stderr: "pipe",
                    },
                );

                const stdoutPromise = new Response(proc.stdout).text();
                const stderrPromise = new Response(proc.stderr).text();
                const killTimer = setTimeout(() => proc.kill(), 90_000);
                const exitCode = await proc.exited;
                clearTimeout(killTimer);
                const stdout = await stdoutPromise;
                const stderr = await stderrPromise;

                expect(exitCode).toBe(0);

                const delta = await waitForLogEntry(
                    logPath,
                    logBefore.length,
                    /inject:footer/,
                    30_000,
                );

                if (!delta) {
                    const logTail = (await readFile(logPath, "utf8").catch(() => "")).slice(-4000);
                    const stdoutTail = stdout.slice(-2000);
                    const stderrTail = stderr.slice(-2000);
                    throw new Error(
                        [
                            "Expected footer injection log entry but did not find one.",
                            `stdout: ${stdoutTail || "(empty)"}`,
                            `stderr: ${stderrTail || "(empty)"}`,
                            `log tail: ${logTail || "(empty)"}`,
                        ].join("\n"),
                    );
                }

                expect(delta).not.toMatch(/idle:inject_failed/);
            } finally {
                await rm(tempDir, { recursive: true, force: true });
            }
        },
        { timeout: 120_000 },
    );
});
