/**
 * Unit tests for `classifyOrphans` — the pure orphan-warning classifier. A local
 * file absent from the incoming manifest is an orphan; the classifier sorts
 * orphans into grouped-retirement / rename-candidate / generic so the load path
 * surfaces one non-noisy warning per cluster instead of one flat string per file.
 */

import { describe, it, expect } from "vitest";

import { classifyOrphans } from "../../src/lib/user-sync/index.js";

describe("classifyOrphans — grouped retirement (T2)", () => {
  it("groups orphans clustered under a subdir entirely absent from the manifest into one classification", () => {
    const result = classifyOrphans({
      localFiles: {
        "old-wu/SESSION-NOTES.md": "notes",
        "old-wu/draft.md": "draft",
        "cur-wu/SESSION-NOTES.md": "cur",
        "WORKING-MEMORY.md": "wm",
      },
      manifestFiles: {
        "cur-wu/SESSION-NOTES.md": "cur",
        "WORKING-MEMORY.md": "wm",
      },
      reconciledSubdirs: new Set(),
      currentWuName: "cur-wu",
    });

    expect(result).toEqual([
      {
        kind: "grouped-retirement",
        subdir: "old-wu",
        files: ["old-wu/SESSION-NOTES.md", "old-wu/draft.md"],
      },
    ]);
  });

  it("excludes files in already-reconciled subdirs — their files are gone, not orphans", () => {
    const result = classifyOrphans({
      localFiles: { "shipped-wu/SESSION-NOTES.md": "x" },
      manifestFiles: { "cur-wu/SESSION-NOTES.md": "cur" },
      reconciledSubdirs: new Set(["shipped-wu"]),
      currentWuName: "cur-wu",
    });

    expect(result).toEqual([]);
  });
});

describe("classifyOrphans — mixed orphans fall back to per-item generic warnings", () => {
  it("emits per-item generic for a flat orphan and a partially-present subdir's orphan", () => {
    const result = classifyOrphans({
      localFiles: {
        "cur-wu/old-note.md": "stale", // cur-wu is partly in the manifest → not a retirement cluster
        "stray.txt": "loose",
      },
      manifestFiles: { "cur-wu/SESSION-NOTES.md": "cur" },
      reconciledSubdirs: new Set(),
      currentWuName: "cur-wu",
    });

    expect(result).toEqual([
      { kind: "generic", name: "cur-wu/old-note.md" },
      { kind: "generic", name: "stray.txt" },
    ]);
  });
});

describe("classifyOrphans — cross-WU-only load (no current WU)", () => {
  it("suppresses per-WU subdir orphans as live other-WU context, keeping flat orphans", () => {
    const result = classifyOrphans({
      localFiles: {
        "other-wu/SESSION-NOTES.md": "other", // live other-WU context — not retirement
        "stray.txt": "loose",
      },
      manifestFiles: { "WORKING-MEMORY.md": "wm" },
      reconciledSubdirs: new Set(),
      currentWuName: undefined,
    });

    expect(result).toEqual([{ kind: "generic", name: "stray.txt" }]);
  });
});

describe("classifyOrphans — content-equivalence rename detection (T1)", () => {
  it("flags an orphan whose content matches a different manifest path as a rename candidate", () => {
    const result = classifyOrphans({
      localFiles: { "cur-wu/old-name.md": "shared body" },
      manifestFiles: {
        "cur-wu/SESSION-NOTES.md": "anchor",
        "cur-wu/new-name.md": "shared body",
      },
      reconciledSubdirs: new Set(),
      currentWuName: "cur-wu",
    });

    expect(result).toEqual([
      { kind: "rename-candidate", from: "cur-wu/old-name.md", to: "cur-wu/new-name.md" },
    ]);
  });

  it("falls back to generic when an orphan's content matches nothing in the manifest", () => {
    const result = classifyOrphans({
      localFiles: { "cur-wu/old-name.md": "unique body" },
      manifestFiles: { "cur-wu/SESSION-NOTES.md": "anchor" },
      reconciledSubdirs: new Set(),
      currentWuName: "cur-wu",
    });

    expect(result).toEqual([{ kind: "generic", name: "cur-wu/old-name.md" }]);
  });

  it("does not treat an empty orphan as a rename even when the manifest has an empty file", () => {
    const result = classifyOrphans({
      localFiles: { "stray.md": "" },
      manifestFiles: { "WORKING-MEMORY.md": "", "cur-wu/SESSION-NOTES.md": "anchor" },
      reconciledSubdirs: new Set(),
      currentWuName: "cur-wu",
    });

    expect(result).toEqual([{ kind: "generic", name: "stray.md" }]);
  });
});
