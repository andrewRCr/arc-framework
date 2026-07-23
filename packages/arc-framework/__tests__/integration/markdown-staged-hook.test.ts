import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

let root: string;

async function executable(path: string, content: string): Promise<void> {
  await writeFile(path, content);
  await chmod(path, 0o755);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-markdown-hook-"));
  await mkdir(join(root, ".husky"), { recursive: true });
  await mkdir(join(root, "bin"), { recursive: true });
  await writeFile(join(root, ".husky/pre-commit"), await readFile(join(repoRoot, ".husky/pre-commit")));
  await executable(join(root, "bin/bash"), [
    "#!/bin/sh",
    "printf 'bash %s\\n' \"$1\" >> \"$ARC_HOOK_LOG\"",
    "exit 0",
    "",
  ].join("\n"));
  await executable(join(root, "bin/npm"), [
    "#!/bin/sh",
    "printf 'npm %s\\n' \"$*\" >> \"$ARC_HOOK_LOG\"",
    "exit \"${ARC_NPM_EXIT:-0}\"",
    "",
  ].join("\n"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function runHook(npmExit: number): Promise<readonly string[]> {
  const log = join(root, "hook.log");
  await execFileAsync("sh", [".husky/pre-commit"], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${join(root, "bin")}:${process.env.PATH ?? ""}`,
      ARC_HOOK_LOG: log,
      ARC_NPM_EXIT: String(npmExit),
    },
  }).catch(() => undefined);
  return (await readFile(log, "utf8")).trim().split("\n");
}

describe("project pre-commit Markdown gate", () => {
  it("runs before package synchronization and TypeScript checks", async () => {
    await expect(runHook(0)).resolves.toEqual([
      "bash .arc/system/.internal/githooks/pre-commit",
      "npm run -s lint:md:staged",
      "bash scripts/check-package-sync.sh",
      "bash scripts/check-ts-quality.sh",
    ]);
  });

  it("propagates a Markdown failure before later checks", async () => {
    await expect(runHook(17)).resolves.toEqual([
      "bash .arc/system/.internal/githooks/pre-commit",
      "npm run -s lint:md:staged",
    ]);
  });
});
