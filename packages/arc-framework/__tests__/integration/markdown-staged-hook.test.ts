import { execa } from "execa";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
    "exit \"${ARC_HOOK_EXIT:-0}\"",
    "",
  ].join("\n"));
  await executable(join(root, "bin/npm"), [
    "#!/bin/sh",
    "printf 'npm %s\\n' \"$*\" >> \"$ARC_HOOK_LOG\"",
    "exit 99",
    "",
  ].join("\n"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function runHook(hookExit: number): Promise<{ code: number | undefined; commands: string[] }> {
  const log = join(root, "hook.log");
  const result = await execa("sh", [".husky/pre-commit"], {
    cwd: root,
    reject: false,
    env: {
      ...process.env,
      PATH: `${join(root, "bin")}:${process.env.PATH ?? ""}`,
      ARC_HOOK_LOG: log,
      ARC_HOOK_EXIT: String(hookExit),
      FORCE_COLOR: undefined,
    },
  });
  return { code: result.exitCode, commands: (await readFile(log, "utf8")).trim().split("\n") };
}

describe("project pre-commit delegation", () => {
  it("runs only ARC's hook and returns its success", async () => {
    await expect(runHook(0)).resolves.toEqual({ code: 0,
      commands: ["bash .arc/system/.internal/githooks/pre-commit"] });
  });

  it("propagates ARC's failure status", async () => {
    await expect(runHook(17)).resolves.toEqual({ code: 17,
      commands: ["bash .arc/system/.internal/githooks/pre-commit"] });
  });
});
