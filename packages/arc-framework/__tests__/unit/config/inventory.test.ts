/** Closed inventory checks for the project configuration authority. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { validateConfigFile } from "../../../src/commands/config/validate.js";
import {
  AGENT_CONSUMABLE_CONFIG_FIELDS,
  ARC_CONFIG_FIELDS,
  COMMIT_CHECK_CONFIG_FIELDS,
  CONFIG_VALIDATION_FIELDS,
  WORKTREE_CONFIG_FIELDS,
} from "../../../src/lib/config/schema.js";

const testDir = fileURLToPath(new URL(".", import.meta.url));
const packageRoot = join(testDir, "..", "..", "..");
const packagedConfigPath = join(packageRoot, "arc", "system", "arc-config.yml");
const launcherPath = join(
  packageRoot,
  "arc",
  "system",
  ".internal",
  "scripts",
  "validate-config.sh",
);
const adapterPaths = [
  "src/lib/config/index.ts",
  "src/lib/config/status-reader.ts",
  "src/lib/config/resolve-override.ts",
  "src/lib/config/resolved-settings.ts",
  "src/lib/commit-check/config.ts",
  "src/lib/git/worktree-location.ts",
  "src/lib/git/worktree-harness-dirs.ts",
  "src/commands/config/validate.ts",
].map((path) => join(packageRoot, path));

function keys(fields: readonly { key: string }[]): string[] {
  return fields.map(({ key }) => key);
}

describe("ARC configuration inventory", () => {
  it("matches every packaged declaration to one ordered catalog descriptor", async () => {
    const content = await readFile(packagedConfigPath, "utf8");
    const declared = content
      .split("\n")
      .flatMap((line) => line.match(/^([a-z][a-z0-9_.]+):/u)?.[1] ?? []);
    const catalog = keys(ARC_CONFIG_FIELDS);

    expect(declared).toEqual(catalog);
    expect(new Set(declared)).toHaveLength(declared.length);
    expect(new Set(catalog)).toHaveLength(catalog.length);
  });

  it("exposes only catalog-derived consumer projections", () => {
    const catalog = new Set(keys(ARC_CONFIG_FIELDS));
    for (const projection of [
      AGENT_CONSUMABLE_CONFIG_FIELDS,
      COMMIT_CHECK_CONFIG_FIELDS,
      CONFIG_VALIDATION_FIELDS,
      WORKTREE_CONFIG_FIELDS,
    ]) {
      expect(keys(projection).every((key) => catalog.has(key))).toBe(true);
    }

    expect(keys(AGENT_CONSUMABLE_CONFIG_FIELDS)).toEqual(
      keys(ARC_CONFIG_FIELDS).filter((key) => !key.startsWith("hooks.")),
    );
    expect(keys(CONFIG_VALIDATION_FIELDS)).toEqual(keys(ARC_CONFIG_FIELDS));
    expect(keys(WORKTREE_CONFIG_FIELDS)).toEqual([
      "worktree.location_template",
      "worktree.post_create",
      "worktree.harness_dirs",
    ]);
  });

  it("recognizes every catalog key and warns for a validator-only extra", async () => {
    const content = [
      ...ARC_CONFIG_FIELDS.map(({ key, defaultValue }) => `${key}: ${defaultValue}`),
      "hooks.subject_warn_length: 50",
    ].join("\n");

    const result = await validateConfigFile({
      readPath: "/selected.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue(content),
    });

    expect(result.lines.filter((line) => line.includes("Unknown key:"))).toEqual([
      "WARN  Unknown key: 'hooks.subject_warn_length' (possible typo?)",
    ]);
  });

  it("finds no unowned consumed key or parallel default table in policy adapters", async () => {
    const catalog = new Set(keys(ARC_CONFIG_FIELDS));
    for (const path of adapterPaths) {
      const source = await readFile(path, "utf8");
      const dottedStringLiterals = [...source.matchAll(/["']([a-z][a-z0-9_]*\.[a-z0-9_.]+)["']/gu)]
        .map((match) => match[1] ?? "");
      for (const key of dottedStringLiterals) expect(catalog.has(key), `${path}: ${key}`).toBe(true);
      expect(source).not.toMatch(/const\s+DEFAULTS\s*[:=]/u);
    }
  });

  it("keeps the installed launcher free of key, domain, and default tables", async () => {
    const launcher = await readFile(launcherPath, "utf8");

    expect(launcher).not.toMatch(/known_keys=|validate_enum|validate_commit_limit/u);
    for (const { key } of ARC_CONFIG_FIELDS) expect(launcher).not.toContain(key);
    expect(launcher).toContain('exec arc config validate --file "$ARC_CONFIG_FILE"');
  });
});
