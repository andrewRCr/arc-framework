/**
 * Unit tests for update file list resolution.
 */

import { describe, expect, it } from "vitest";
import { diffFileLists } from "../../../src/lib/manifest/update-files.js";

describe("diffFileLists", () => {
  it("returns all files in keep when lists are identical", () => {
    const manifest = ["reference/constitution/DEV-RULES.ARC.md", "system/arc-config.yml"];
    const updated = ["reference/constitution/DEV-RULES.ARC.md", "system/arc-config.yml"];

    const result = diffFileLists(manifest, updated);

    expect(result.keep).toEqual(expect.arrayContaining(manifest));
    expect(result.keep).toHaveLength(2);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it("detects new files in the updated list", () => {
    const manifest = ["system/arc-config.yml"];
    const updated = ["system/arc-config.yml", "reference/strategies/new-strategy.md"];

    const result = diffFileLists(manifest, updated);

    expect(result.keep).toEqual(["system/arc-config.yml"]);
    expect(result.added).toEqual(["reference/strategies/new-strategy.md"]);
    expect(result.removed).toHaveLength(0);
  });

  it("detects removed files no longer in the updated list", () => {
    const manifest = ["system/arc-config.yml", "reference/old-file.md"];
    const updated = ["system/arc-config.yml"];

    const result = diffFileLists(manifest, updated);

    expect(result.keep).toEqual(["system/arc-config.yml"]);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toEqual(["reference/old-file.md"]);
  });

  it("handles all three categories simultaneously", () => {
    const manifest = ["kept.md", "removed.md"];
    const updated = ["kept.md", "added.md"];

    const result = diffFileLists(manifest, updated);

    expect(result.keep).toEqual(["kept.md"]);
    expect(result.added).toEqual(["added.md"]);
    expect(result.removed).toEqual(["removed.md"]);
  });

  it("handles empty manifest (fresh-like scenario)", () => {
    const result = diffFileLists([], ["a.md", "b.md"]);

    expect(result.keep).toHaveLength(0);
    expect(result.added).toEqual(["a.md", "b.md"]);
    expect(result.removed).toHaveLength(0);
  });

  it("handles empty updated list (everything removed)", () => {
    const result = diffFileLists(["a.md", "b.md"], []);

    expect(result.keep).toHaveLength(0);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toEqual(["a.md", "b.md"]);
  });
});
