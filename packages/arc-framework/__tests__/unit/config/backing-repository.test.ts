/** Backing-repository configuration through the public configuration readers. */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runConfigStatus } from "../../../src/commands/config/status.js";
import { validateConfigFile } from "../../../src/commands/config/validate.js";
import { ARC_CONFIG_FIELDS } from "../../../src/lib/config/schema.js";

const roots: string[] = [];

async function fixture(content?: string): Promise<{ root: string; configPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "arc-backing-config-"));
  roots.push(root);
  const directory = join(root, ".arc", "system");
  await mkdir(directory, { recursive: true });
  const configPath = join(directory, "arc-config.yml");
  if (content !== undefined) await writeFile(configPath, content);
  return { root, configPath };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("backing repository configuration", () => {
  it("lists an empty default in config status when absent", async () => {
    const { root } = await fixture("");
    const result = await runConfigStatus({ cwd: root });
    expect(result.settings).toHaveProperty(["storage.backing_repository"], "");
    expect(result.defaultsApplied).toContain("storage.backing_repository");
    expect(result.warnings).toEqual([]);
  });

  it.each(["", "https://example.test/team/state.git", "git@example.test:team/state.git"])(
    "reads and validates the configured pointer %j",
    async (value) => {
      const { root, configPath } = await fixture(`storage.backing_repository: "${value}"\n`);
      const status = await runConfigStatus({ cwd: root });
      expect(status.settings).toHaveProperty(["storage.backing_repository"], value);
      expect(status.defaultsApplied).not.toContain("storage.backing_repository");
      expect(status.warnings).toEqual([]);
      const validation = await validateConfigFile({ readPath: configPath, displayPath: "arc-config.yml" });
      expect(validation.warnings).toBe(0);
      expect(validation.errors).toBe(0);
      expect(validation.exitCode).toBe(0);
    },
  );

  it("recognizes a backing pointer without an unknown-key warning", async () => {
    const { configPath } = await fixture("storage.backing_repository: https://example.test/state.git\n");
    const result = await validateConfigFile({ readPath: configPath, displayPath: "arc-config.yml" });
    expect(result.warnings).toBe(0);
    expect(result.exitCode).toBe(0);
  });

  it("owns an unset repository URL policy with an empty sentinel and trimmed nonempty values", () => {
    const descriptor = ARC_CONFIG_FIELDS.find(({ key }) => String(key) === "storage.backing_repository");
    expect(descriptor).toBeDefined();
    if (descriptor === undefined) throw new Error("backing repository descriptor missing");
    expect(descriptor.policy).toEqual({ kind: "repository-url" });
    expect(descriptor.quotedEmpty).toBe("unset");
    expect(descriptor.defaultValue).toBe("");
    expect(descriptor.schema.parse("")).toBe("");
    expect(descriptor.schema.parse(" https://example.test/state.git ")).toBe("https://example.test/state.git");
    expect(descriptor.schema.safeParse(" \t ").success).toBe(false);
  });
});
