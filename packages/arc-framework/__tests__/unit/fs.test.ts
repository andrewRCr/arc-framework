/**
 * Unit tests for shared filesystem utilities.
 *
 * @module
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";

import { atomicWriteJson, toForwardSlash } from "../../src/lib/fs.js";

describe("atomicWriteJson", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "arc-fs-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes JSON to a new file atomically", async () => {
    const target = join(tempDir, "manifest.json");
    const data = { framework_version: "1.0.0", files: {} };

    await atomicWriteJson(target, data);

    const content = await readFile(target, "utf-8");
    expect(JSON.parse(content)).toEqual(data);
    // Pretty-printed with trailing newline
    expect(content).toBe(JSON.stringify(data, null, 2) + "\n");
  });

  it("atomically replaces an existing file", async () => {
    const target = join(tempDir, "manifest.json");
    const original = { version: "1.0.0" };
    const updated = { version: "2.0.0" };

    await writeFile(target, JSON.stringify(original, null, 2) + "\n", "utf-8");
    await atomicWriteJson(target, updated);

    const content = await readFile(target, "utf-8");
    expect(JSON.parse(content)).toEqual(updated);
  });

  it("uses a temp file in the same directory as the target", async () => {
    const target = join(tempDir, "pristine.json");
    const data = { content: "test" };

    // After successful write, temp file should be cleaned up
    await atomicWriteJson(target, data);

    // Verify no .tmp file remains
    const files = (await import("node:fs/promises")).readdir;
    const entries = await files(tempDir);
    expect(entries).toEqual(["pristine.json"]);
  });

  it("creates parent directories when they do not exist", async () => {
    const target = join(tempDir, "nonexistent", "subdir", "manifest.json");

    await atomicWriteJson(target, { version: "2.0.0" });

    const content = await readFile(target, "utf-8");
    expect(JSON.parse(content)).toEqual({ version: "2.0.0" });
  });

  it("cleans up temp file on write failure", async () => {
    // Create a target directory, then make it read-only to trigger rename failure
    const subDir = join(tempDir, "readonly");
    await mkdir(subDir);
    const target = join(subDir, "manifest.json");

    // Write original
    await writeFile(target, '{"v":1}\n', "utf-8");

    // Make directory read-only to prevent temp file creation
    await (await import("node:fs/promises")).chmod(subDir, 0o444);

    try {
      await expect(atomicWriteJson(target, { v: 2 })).rejects.toThrow();

      // No temp files left behind
      await (await import("node:fs/promises")).chmod(subDir, 0o755);
      const entries = (await (await import("node:fs/promises")).readdir(subDir))
        .filter((f: string) => f.endsWith(".tmp"));
      expect(entries).toEqual([]);
    } finally {
      // Restore permissions for cleanup
      await (await import("node:fs/promises")).chmod(subDir, 0o755);
    }
  });

  it("works when parent directories already exist", async () => {
    const subDir = join(tempDir, "system", ".internal");
    await mkdir(subDir, { recursive: true });
    const target = join(subDir, "manifest.json");

    await atomicWriteJson(target, { ok: true });

    const content = await readFile(target, "utf-8");
    expect(JSON.parse(content)).toEqual({ ok: true });
  });
});

describe("toForwardSlash", () => {
  it("replaces backslashes with forward slashes", () => {
    expect(toForwardSlash("system\\.internal\\file.json")).toBe("system/.internal/file.json");
  });

  it("leaves forward slashes unchanged", () => {
    expect(toForwardSlash("system/.internal/file.json")).toBe("system/.internal/file.json");
  });

  it("handles mixed separators", () => {
    expect(toForwardSlash("user\\alice/SESSION-NOTES.md")).toBe("user/alice/SESSION-NOTES.md");
  });

  it("handles empty string", () => {
    expect(toForwardSlash("")).toBe("");
  });
});
