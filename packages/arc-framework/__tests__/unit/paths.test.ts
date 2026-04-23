import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { getArcTemplatePath, getInternalTemplatePath, resolveArcRoot } from "../../src/lib/paths.js";

describe("getArcTemplatePath", () => {
  it("returns an absolute path ending with /arc", () => {
    const result = getArcTemplatePath();
    expect(isAbsolute(result)).toBe(true);
    expect(result).toMatch(/\/arc$/);
  });

  it("resolves within the package directory", () => {
    const result = getArcTemplatePath();
    expect(result).toContain("packages/arc-framework");
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
    expect(result).toMatch(/\/templates$/);
  });

  it("resolves within the package directory", () => {
    const result = getInternalTemplatePath();
    expect(result).toContain("packages/arc-framework");
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

  it("finds an ARC root one level up", async () => {
    const child = join(tempDir, "child");
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
