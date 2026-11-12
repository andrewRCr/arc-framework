import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { getArcTemplatePath, getInternalTemplatePath, resolveArcRoot } from "../../src/lib/paths.js";

describe("getArcTemplatePath", () => {
  it("returns an absolute path ending with /arc", () => {
    const result = getArcTemplatePath();
    expect(isAbsolute(result)).toBe(true);
    expect(basename(result)).toBe("arc");
  });

  it("resolves within the package directory", () => {
    const result = getArcTemplatePath();
    expect(result).toContain(join("packages", "arc-framework"));
  });

  it("points to a directory that exists after build", () => {
    // arc/ is a build artifact containing framework templates
    // This test verifies the resolution is correct post-build
    const result = getArcTemplatePath();
    expect(existsSync(result)).toBe(true);
  });
});

describe("getInternalTemplatePath", () => {
  it("returns an absolute path ending with /templates", () => {
    const result = getInternalTemplatePath();
    expect(isAbsolute(result)).toBe(true);
    expect(basename(result)).toBe("templates");
  });

  it("resolves within the package directory", () => {
    const result = getInternalTemplatePath();
    expect(result).toContain(join("packages", "arc-framework"));
  });
});

describe("resolveArcRoot", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "arc-paths-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("finds an ARC root when .arc exists at the starting directory", async () => {
    await mkdir(join(tempDir, ".arc"));

    expect(resolveArcRoot(tempDir)).toBe(tempDir);
  });

  it("does not treat machine configuration alone as an ARC project", async () => {
    await mkdir(join(tempDir, ".arc"));
    await writeFile(join(tempDir, ".arc/config.yml"), "checks.runner: [runner]\n");
    const child = join(tempDir, "outside-project");
    await mkdir(child);

    expect(resolveArcRoot(child)).toBeNull();
  });

  it("finds an ARC root one level up", async () => {
    const child = join(tempDir, "child");
    await mkdir(join(tempDir, ".arc"));
    await mkdir(child);

    expect(resolveArcRoot(child)).toBe(tempDir);
  });

  it("finds an ARC root with a decomposed native directory name", async () => {
    const root = join(tempDir, "cafe\u0301");
    await mkdir(join(root, ".arc"), { recursive: true });

    expect(resolveArcRoot(root)).toBe(root);
  });

  it("walks up from a decomposed native child directory", async () => {
    const child = join(tempDir, "cafe\u0301");
    await mkdir(join(tempDir, ".arc"));
    await mkdir(child);

    expect(resolveArcRoot(child)).toBe(tempDir);
  });

  it("finds an ARC root two levels up", async () => {
    const nested = join(tempDir, "child", "grandchild");
    await mkdir(join(tempDir, ".arc"));
    await mkdir(nested, { recursive: true });

    expect(resolveArcRoot(nested)).toBe(tempDir);
  });

  it("returns null when no ARC root exists", async () => {
    const nested = join(tempDir, "child", "grandchild");
    await mkdir(nested, { recursive: true });

    expect(resolveArcRoot(nested)).toBeNull();
  });

  it("handles the filesystem root boundary cleanly", () => {
    expect(resolveArcRoot("/")).toBeNull();
  });

  it("respects an explicit startDir", async () => {
    const nested = join(tempDir, "child", "grandchild");
    await mkdir(join(tempDir, ".arc"));
    await mkdir(nested, { recursive: true });

    expect(resolveArcRoot(nested)).toBe(tempDir);
  });
});
