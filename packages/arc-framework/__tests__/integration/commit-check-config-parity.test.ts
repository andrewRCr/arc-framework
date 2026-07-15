/** Shell/TypeScript parity tests for duplicate commit-check configuration keys. */

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { parseArcConfig } from "../../src/lib/config/index.js";

const execFileAsync = promisify(execFile);
const arcLibPath = resolve("arc/system/.internal/scripts/arc-lib.sh");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function readWithShell(content: string, fallback: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-commit-config-"));
  roots.push(root);
  const configPath = join(root, "arc-config.yml");
  await writeFile(configPath, content);
  const { stdout } = await execFileAsync(
    "bash",
    ["-c", '. "$1"; arc_config_get "commit.format" "$2"', "bash", arcLibPath, fallback],
    { env: { ...process.env, ARC_CONFIG_FILE: configPath } },
  );
  return stdout.replace(/\n$/, "");
}

describe("arc_config_get and parseArcConfig duplicate parity", () => {
  it.each([
    ["commit.format: custom\ncommit.format: any\n", "custom"],
    ["commit.format:\ncommit.format: any\n", "conventional"],
    ["commit.format: ''\ncommit.format: any\n", ""],
    ['commit.format: ""\ncommit.format: any\n', ""],
  ])("selects the first physical definition", async (content, expected) => {
    const shellValue = await readWithShell(content, "conventional");
    const parsedValue = parseArcConfig(content)["commit.format"] ?? "conventional";

    expect(shellValue).toBe(expected);
    expect(parsedValue).toBe(expected);
  });
});
