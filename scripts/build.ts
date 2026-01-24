#!/usr/bin/env bun

import { rm } from "node:fs/promises";
import { spawn as nodeSpawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function getRepoRoot(): string {
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFilePath);
    return path.resolve(currentDir, "..");
}

async function removePath(targetPath: string): Promise<void> {
    await rm(targetPath, {
        recursive: true,
        force: true,
    });
}

type RunOptions = {
    cwd: string;
};

async function runCommand(command: string, args: string[], options: RunOptions): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const child = nodeSpawn(command, args, {
            cwd: options.cwd,
            stdio: "inherit",
            shell: false,
        });

        child.on("error", reject);
        child.on("exit", (exitCode) => {
            if (exitCode === 0) {
                resolve();
                return;
            }

            reject(new Error(`Command failed (${exitCode ?? "null"}): ${command} ${args.join(" ")}`));
        });
    });
}

async function main(): Promise<void> {
    const repoRoot = getRepoRoot();

    await removePath(path.join(repoRoot, "dist"));

    await runCommand("tsc", ["-p", "tsconfig.build.json"], {
        cwd: repoRoot,
    });
}

try {
    await main();
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
