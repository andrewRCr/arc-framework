import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  validateManifest,
  readManifest,
  writeManifest,
} from "../../src/lib/manifest.js";
import type { Manifest } from "../../src/lib/types.js";

function validManifest(): Manifest {
  return {
    framework_version: "0.1.0",
    installed_at: "2026-03-12T00:00:00.000Z",
    install_config: {
      project_name: "My App",
      pm_mode: "none",
      arc_dir: ".arc",
      tools: ["claude"],
    },
    files: {
      "reference/constitution/DEV-RULES.ARC.md": {
        classification: "Framework",
        layer: "core",
        pristine_hash: "abc123",
      },
    },
  };
}

describe("validateManifest", () => {
  it("accepts a valid manifest", () => {
    const result = validateManifest(validManifest());
    expect(result.valid).toBe(true);
  });

  it("rejects manifest with missing required fields", () => {
    const partial = { framework_version: "0.1.0" } as unknown;
    const result = validateManifest(partial);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid classification value", () => {
    const manifest = validManifest();
    manifest.files["some/file.md"] = {
      classification: "Invalid" as "Framework",
      layer: "core",
      pristine_hash: "abc",
    };
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("classification"))).toBe(true);
  });

  it("rejects invalid layer value", () => {
    const manifest = validManifest();
    manifest.files["some/file.md"] = {
      classification: "Framework",
      layer: "invalid" as "core",
      pristine_hash: "abc",
    };
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("layer"))).toBe(true);
  });
});

describe("readManifest / writeManifest", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "arc-manifest-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("round-trips: write then read back produces equal manifest", async () => {
    const manifest = validManifest();
    const filePath = join(tmpDir, "manifest.json");
    await writeManifest(filePath, manifest);
    const loaded = await readManifest(filePath);
    expect(loaded).toEqual(manifest);
  });

  it("returns null for non-existent file", async () => {
    const result = await readManifest(join(tmpDir, "missing.json"));
    expect(result).toBeNull();
  });

  it("throws on malformed JSON", async () => {
    const filePath = join(tmpDir, "bad.json");
    await writeFile(filePath, "not json {{{", "utf-8");
    await expect(readManifest(filePath)).rejects.toThrow("Malformed JSON");
  });
});
