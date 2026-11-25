/** Backing-repository configuration through the public configuration readers. */

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { load } from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";

import { runConfigStatus } from "../../../src/commands/config/status.js";
import { validateConfigFile } from "../../../src/commands/config/validate.js";
import { ArcConfigSchema, ARC_CONFIG_FIELDS } from "../../../src/lib/config/schema.js";
import { readBackingRepository, writeBackingRepository } from "../../../src/lib/config/status-reader.js";

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

  it("owns an unset repository URL policy with an empty sentinel and lossless valid values", () => {
    const descriptor = ARC_CONFIG_FIELDS.find(({ key }) => String(key) === "storage.backing_repository");
    expect(descriptor).toBeDefined();
    if (descriptor === undefined) throw new Error("backing repository descriptor missing");
    expect(descriptor.policy).toEqual({ kind: "repository-url" });
    expect(descriptor.quotedEmpty).toBe("unset");
    expect(descriptor.defaultValue).toBe("");
    expect(descriptor.schema.parse("")).toBe("");
    expect(descriptor.schema.parse(" https://example.test/state.git ")).toBe(" https://example.test/state.git ");
    expect(descriptor.schema.safeParse(" \t ").success).toBe(false);
  });
});

describe("the tracked backing pointer writer", () => {
  it.each([["LF", "\n"], ["CRLF", "\r\n"]])("round-trips a backslash path through the production reader in a %s file, keeping its other lines", async (_name, eol) => {
    const lines = ["# Keep this comment.", 'history.policy: "rewrite-with-lease"', 'storage.backing_repository: ""', "commit.format: conventional", ""];
    const { root, configPath } = await fixture(lines.join(eol));
    const value = "C:\\repos\\state.git";
    for (let write = 0; write < 2; write++) {
      await writeBackingRepository(root, value);
      expect(await readBackingRepository(root)).toBe(value);
      expect(await readFile(configPath, "utf8")).toBe(lines.map((line) => line.startsWith("storage.") ? `storage.backing_repository: '${value}'` : line).join(eol));
    }
    await writeBackingRepository(root, null);
    expect(await readBackingRepository(root)).toBeNull();
    expect(await readFile(configPath, "utf8")).toBe(lines.map((line) => line.startsWith("storage.") ? "storage.backing_repository: ''" : line).join(eol));
  });

  it.each([["LF", "\n"], ["CRLF", "\r\n"]])("appends an absent pointer with the %s file's line ending", async (_name, eol) => {
    const { root, configPath } = await fixture(["# Settings.", "commit.format: conventional"].join(eol));
    await writeBackingRepository(root, "https://example.test/state.git");
    expect(await readFile(configPath, "utf8")).toBe(["# Settings.", "commit.format: conventional", "storage.backing_repository: 'https://example.test/state.git'", ""].join(eol));
    expect(await readBackingRepository(root)).toBe("https://example.test/state.git");
  });

  it.each([["two lines", "https://example.test/a\nstate.git", /one line/u], ["a single quote", "C:\\repos\\o'brien.git", /single quote/u]])(
    "refuses a pointer on %s, leaving the file unchanged", async (_name, value, message) => {
      const { root, configPath } = await fixture('storage.backing_repository: ""\n');
      await expect(writeBackingRepository(root, value)).rejects.toThrow(message);
      expect(await readFile(configPath, "utf8")).toBe('storage.backing_repository: ""\n');
    });

  it.each(["C:\\repos\\state.git", 'D:\\team "state"\\repo.git'])("writes %j so a standard YAML parser and the reader decode it alike", async value => {
    const { root, configPath } = await fixture();
    await writeBackingRepository(root, value);
    expect(load(await readFile(configPath, "utf8"))).toEqual({ "storage.backing_repository": value });
    expect(await readBackingRepository(root)).toBe(value);
  });

  it("names the key, the file and a remedy for an invalid stored pointer", async () => {
    const { root, configPath } = await fixture('storage.backing_repository: " \t "\n');
    const read = readBackingRepository(root);
    await expect(read).rejects.toThrow("storage.backing_repository");
    await expect(read).rejects.toThrow(configPath);
    await expect(read).rejects.toThrow(/then retry/u);
  });
});


describe("backing pointers through the full authoring boundary", () => {
  it.each(["   ", " \t "])("returns an ordinary schema and public validation error for %j", async value => {
    expect(ArcConfigSchema.safeParse({ "storage.backing_repository": value }).success).toBe(false);
    const { configPath } = await fixture(`storage.backing_repository: "${value}"\n`);
    const result = await validateConfigFile({ readPath: configPath, displayPath: "arc-config.yml" });
    expect(result.exitCode).toBe(2);
    expect(result.errors).toBe(1);
    expect(result.lines.join("\n")).toMatch(/ERROR storage\.backing_repository.*non-whitespace/u);
  });

  it("accepts padded pointers losslessly in the schema and public validator", async () => {
    const value = " https://example.test/state.git ";
    expect(ArcConfigSchema.parse({ "storage.backing_repository": value })).toEqual({ "storage.backing_repository": value });
    const { root, configPath } = await fixture(`storage.backing_repository: "${value}"\n`);
    const result = await validateConfigFile({ readPath: configPath, displayPath: "arc-config.yml" });
    expect(result.errors).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(await readBackingRepository(root)).toBe(value.trim());

  });
});


it("normalizes padded pointer writes before persisting them", async () => {
  const { root, configPath } = await fixture();
  await writeBackingRepository(root, " https://example.test/state.git ");
  expect(await readFile(configPath, "utf8")).toBe("storage.backing_repository: 'https://example.test/state.git'\n");
  expect(await readBackingRepository(root)).toBe("https://example.test/state.git");
});

it.each(["\n", "\r\n", "\u00a0"])("rejects a whitespace-only %j pointer through the leaf and full schema", value => {
  const descriptor = ARC_CONFIG_FIELDS.find(({ key }) => key === "storage.backing_repository");
  if (descriptor === undefined) throw new Error("missing backing descriptor");
  expect(descriptor.schema.safeParse(value).success).toBe(false);
  expect(ArcConfigSchema.safeParse({ "storage.backing_repository": value }).success).toBe(false);
});
