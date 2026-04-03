import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  validateManifest,
  readManifest,
} from "../../../src/lib/manifest/store.js";
import { buildManifest, buildFileEntry } from "../../helpers/factories.js";
import { MANIFEST_SCHEMA_VERSION } from "../../../src/lib/constants.js";
import { UserFacingError } from "../../../src/lib/errors.js";
import type { Manifest } from "../../../src/lib/types.js";

const readFileFn = (path: string): Promise<string> => readFile(path, "utf-8");

function validManifest() {
  return buildManifest({
    framework_version: "0.1.0",
    installed_at: "2026-03-12T00:00:00.000Z",
    install_config: {
      project_name: "My App",
      pm_mode: "none",
      tools: ["claude"],
    },
    files: {
      "reference/constitution/DEV-RULES.ARC.md": buildFileEntry(),
    },
  });
}

function writeManifestHelper(path: string, manifest: Manifest): Promise<void> {
  return writeFile(path, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
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

  it("rejects install_config with non-string project_name", () => {
    const data = {
      ...validManifest(),
      install_config: { project_name: 123, pm_mode: "none", tools: [] },
    };
    const result = validateManifest(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("project_name"))).toBe(true);
  });

  it("rejects install_config with non-string pm_mode", () => {
    const data = {
      ...validManifest(),
      install_config: { project_name: "App", pm_mode: null, tools: [] },
    };
    const result = validateManifest(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("pm_mode"))).toBe(true);
  });

  it("rejects install_config with non-array tools", () => {
    const data = {
      ...validManifest(),
      install_config: { project_name: "App", pm_mode: "none", tools: "not-an-array" },
    };
    const result = validateManifest(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("tools"))).toBe(true);
  });

  it("accepts valid install_config with all required fields", () => {
    const result = validateManifest(validManifest());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("readManifest", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "arc-manifest-test-"));
  });

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it("round-trips: write then read back produces equal manifest", async () => {
    const manifest = validManifest();
    const filePath = join(tmpDir, "manifest.json");
    await writeManifestHelper(filePath, manifest);
    const loaded = await readManifest(filePath, readFileFn);
    expect(loaded).toEqual(manifest);
  });

  it("returns null for non-existent file", async () => {
    const result = await readManifest(join(tmpDir, "missing.json"), readFileFn);
    expect(result).toBeNull();
  });

  it("throws on malformed JSON", async () => {
    const filePath = join(tmpDir, "bad.json");
    await writeFile(filePath, "not json {{{", "utf-8");
    await expect(readManifest(filePath, readFileFn)).rejects.toThrow("Malformed JSON");
  });

  it("migrates manifest without schema_version to version 1", async () => {
    const manifest = validManifest();
    const withoutSchema = Object.fromEntries(
      Object.entries(manifest).filter(([key]) => key !== "schema_version"),
    );
    const filePath = join(tmpDir, "manifest.json");
    await writeFile(filePath, JSON.stringify(withoutSchema, null, 2), "utf-8");
    const loaded = await readManifest(filePath, readFileFn);
    expect(loaded?.schema_version).toBe(1);
  });

  it("rejects manifest with schema_version higher than supported", async () => {
    const manifest = { ...validManifest(), schema_version: MANIFEST_SCHEMA_VERSION + 1 };
    const filePath = join(tmpDir, "manifest.json");
    await writeFile(filePath, JSON.stringify(manifest, null, 2), "utf-8");
    await expect(readManifest(filePath, readFileFn)).rejects.toThrow(UserFacingError);
  });

  it("accepts manifest with current schema_version", async () => {
    const manifest = validManifest();
    const filePath = join(tmpDir, "manifest.json");
    await writeManifestHelper(filePath, manifest);
    const loaded = await readManifest(filePath, readFileFn);
    expect(loaded?.schema_version).toBe(MANIFEST_SCHEMA_VERSION);
  });

  it("round-trips schema_version through write and read", async () => {
    const manifest = validManifest();
    const filePath = join(tmpDir, "manifest.json");
    await writeManifestHelper(filePath, manifest);
    const loaded = await readManifest(filePath, readFileFn);
    expect(loaded).toEqual(manifest);
  });
});
