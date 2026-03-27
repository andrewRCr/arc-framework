import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  readChangelog,
  filterChangelogRange,
  buildChangelogDisplay,
  type ChangelogData,
} from "../../src/lib/changelog.js";

// --- readChangelog ---

describe("readChangelog", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "arc-changelog-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reads and parses valid changelog JSON", async () => {
    const data: ChangelogData = {
      "0.1.0": {
        date: "2026-03-01",
        highlights: ["First release"],
        breaking: [],
      },
    };
    const filePath = join(tempDir, "versions.json");
    await writeFile(filePath, JSON.stringify(data));

    const result = await readChangelog(filePath);

    expect(result).toEqual(data);
  });

  it("returns null when file does not exist", async () => {
    const result = await readChangelog(join(tempDir, "nonexistent.json"));

    expect(result).toBeNull();
  });

  it("returns null when file contains invalid JSON", async () => {
    const filePath = join(tempDir, "versions.json");
    await writeFile(filePath, "not json{{{");

    const result = await readChangelog(filePath);

    expect(result).toBeNull();
  });

  it("returns null when JSON is an array instead of object", async () => {
    const filePath = join(tempDir, "versions.json");
    await writeFile(filePath, "[]");

    const result = await readChangelog(filePath);

    expect(result).toBeNull();
  });

  it("returns null when JSON is a primitive", async () => {
    const filePath = join(tempDir, "versions.json");
    await writeFile(filePath, '"just a string"');

    const result = await readChangelog(filePath);

    expect(result).toBeNull();
  });
});

// --- filterChangelogRange ---

describe("filterChangelogRange", () => {
  const sampleData: ChangelogData = {
    "0.1.0": {
      date: "2026-03-01",
      highlights: ["Initial release"],
      breaking: [],
    },
    "0.2.0": {
      date: "2026-03-10",
      highlights: ["Added update command"],
      breaking: ["arc-config.yml restructured"],
    },
    "0.3.0": {
      date: "2026-03-20",
      highlights: ["Team mode support"],
      breaking: [],
    },
    "0.4.0": {
      date: "2026-03-25",
      highlights: ["Changelog display"],
      breaking: [],
    },
  };

  it("filters entries in the (previous, current] range", () => {
    const result = filterChangelogRange(sampleData, "0.1.0", "0.3.0");

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]!.version).toBe("0.2.0");
    expect(result.entries[1]!.version).toBe("0.3.0");
  });

  it("excludes the previous version (lower bound is exclusive)", () => {
    const result = filterChangelogRange(sampleData, "0.2.0", "0.4.0");

    expect(result.entries.map((e) => e.version)).toEqual(["0.3.0", "0.4.0"]);
  });

  it("includes the current version (upper bound is inclusive)", () => {
    const result = filterChangelogRange(sampleData, "0.3.0", "0.4.0");

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.version).toBe("0.4.0");
  });

  it("returns empty entries when previousVersion equals currentVersion", () => {
    const result = filterChangelogRange(sampleData, "0.2.0", "0.2.0");

    expect(result.entries).toEqual([]);
    expect(result.hasBreaking).toBe(false);
  });

  it("returns empty entries when no versions fall in range", () => {
    const result = filterChangelogRange(sampleData, "0.5.0", "0.6.0");

    expect(result.entries).toEqual([]);
  });

  it("sorts entries by version ascending", () => {
    // Provide data in reverse order to verify sorting
    const unordered: ChangelogData = {
      "0.3.0": { date: "2026-03-20", highlights: ["Third"], breaking: [] },
      "0.1.0": { date: "2026-03-01", highlights: ["First"], breaking: [] },
      "0.2.0": { date: "2026-03-10", highlights: ["Second"], breaking: [] },
    };

    const result = filterChangelogRange(unordered, "0.0.0", "0.3.0");

    expect(result.entries.map((e) => e.version)).toEqual(["0.1.0", "0.2.0", "0.3.0"]);
  });

  it("sets hasBreaking when any entry has breaking changes", () => {
    const result = filterChangelogRange(sampleData, "0.1.0", "0.3.0");

    expect(result.hasBreaking).toBe(true);
  });

  it("sets hasBreaking to false when no entries have breaking changes", () => {
    const result = filterChangelogRange(sampleData, "0.2.0", "0.4.0");

    expect(result.hasBreaking).toBe(false);
  });

  it("skips entries with invalid semver keys", () => {
    const withInvalid: ChangelogData = {
      ...sampleData,
      "not-semver": { date: "2026-01-01", highlights: ["Bad"], breaking: [] },
    };

    const result = filterChangelogRange(withInvalid, "0.0.0", "0.4.0");

    expect(result.entries.map((e) => e.version)).not.toContain("not-semver");
  });
});

// --- buildChangelogDisplay ---

describe("buildChangelogDisplay", () => {
  it("returns null when entries are empty", () => {
    const result = buildChangelogDisplay({ entries: [], hasBreaking: false });

    expect(result).toBeNull();
  });

  it("formats a single version with highlights", () => {
    const result = buildChangelogDisplay({
      entries: [{
        version: "0.2.0",
        entry: {
          date: "2026-03-10",
          highlights: ["Added update command", "Improved init flow"],
          breaking: [],
        },
      }],
      hasBreaking: false,
    });

    expect(result).toContain("v0.2.0 (2026-03-10)");
    expect(result).toContain("  - Added update command");
    expect(result).toContain("  - Improved init flow");
    expect(result).not.toContain("Breaking");
  });

  it("formats breaking changes with migration notes", () => {
    const result = buildChangelogDisplay({
      entries: [{
        version: "0.3.0",
        entry: {
          date: "2026-03-20",
          highlights: ["Team mode"],
          breaking: ["arc-config.yml restructured"],
          migrationNotes: "Run arc update, then review arc-config.yml.",
        },
      }],
      hasBreaking: true,
    });

    expect(result).toContain("Breaking:");
    expect(result).toContain("    - arc-config.yml restructured");
    expect(result).toContain("Migration: Run arc update, then review arc-config.yml.");
  });

  it("formats multiple versions separated by blank lines", () => {
    const result = buildChangelogDisplay({
      entries: [
        {
          version: "0.1.0",
          entry: { date: "2026-03-01", highlights: ["First"], breaking: [] },
        },
        {
          version: "0.2.0",
          entry: { date: "2026-03-10", highlights: ["Second"], breaking: [] },
        },
      ],
      hasBreaking: false,
    });

    expect(result).toContain("v0.1.0 (2026-03-01)");
    expect(result).toContain("v0.2.0 (2026-03-10)");
    // Versions should be separated by a blank line
    const lines = result!.split("\n");
    const v1Index = lines.findIndex((l) => l.includes("v0.1.0"));
    const v2Index = lines.findIndex((l) => l.includes("v0.2.0"));
    // There should be a blank line between the sections
    expect(lines.slice(v1Index, v2Index).some((l) => l === "")).toBe(true);
  });

  it("omits highlights section when array is empty", () => {
    const result = buildChangelogDisplay({
      entries: [{
        version: "0.1.0",
        entry: {
          date: "2026-03-01",
          highlights: [],
          breaking: ["Something broke"],
        },
      }],
      hasBreaking: true,
    });

    expect(result).toContain("v0.1.0");
    expect(result).toContain("Breaking:");
    // Should not have a dangling "  - " with no content
    const lines = result!.split("\n");
    expect(lines.every((l) => l !== "  - ")).toBe(true);
  });
});
