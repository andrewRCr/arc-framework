/** Process-level integration coverage for `arc config validate`. */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const testDir = fileURLToPath(new URL(".", import.meta.url));
const packageRoot = join(testDir, "..", "..");
const cliPath = join(packageRoot, "src", "cli.ts");
const tsxCliPath = fileURLToPath(import.meta.resolve("tsx/cli"));
const roots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "arc-config-validate-cli-"));
  roots.push(root);
  return root;
}

function runConfigValidate(cwd: string, args: string[] = []) {
  return spawnSync(process.execPath, [tsxCliPath, cliPath, "config", "validate", ...args], {
    cwd,
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("arc config validate", () => {
  it("resolves the default config from a nested project directory", () => {
    const root = fixtureRoot();
    const configDir = join(root, ".arc", "system");
    const nested = join(root, "nested", "deeper");
    mkdirSync(configDir, { recursive: true });
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(configDir, "arc-config.yml"), "branch.protection: full\n");

    const result = runConfigValidate(nested);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS  Config file exists: .arc/system/arc-config.yml");
    expect(result.stdout).toContain("PASS  branch.protection: full");
    expect(result.stderr).toBe("");
  });

  it("resolves a relative explicit path outside an ARC root and preserves its token", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "selected.yml"), "unknown.setting: value\n");

    const result = runConfigValidate(root, ["--file", "selected.yml"]);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("PASS  Config file exists: selected.yml");
    expect(result.stdout).toContain("WARN  Unknown key: 'unknown.setting'");
    expect(result.stdout).not.toContain(join(root, "selected.yml"));
    expect(result.stderr).toBe("");
  });

  it("accepts an absolute explicit path and propagates validation errors", () => {
    const root = fixtureRoot();
    const selected = join(root, "absolute.yml");
    writeFileSync(selected, "branch.protection: impossible\n");

    const result = runConfigValidate(tmpdir(), ["--file", selected]);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain(`PASS  Config file exists: ${selected}`);
    expect(result.stdout).toContain("ERROR branch.protection: 'impossible' is not valid");
    expect(result.stderr).toBe("");
  });
});
