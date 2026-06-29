import { describe, expect, it } from "vitest";

import {
  COMPACTION_SEED_SCHEMA_VERSION,
  isCompactionSeed,
  parseCompactionSeedJson,
  stringifyCompactionSeed,
  type CompactionSeed,
  type CompactionSeedSchemaVersion,
} from "../../../src/lib/compaction-seed/schema.js";
import type { LoadSetManifest } from "../../../src/lib/load-set/types.js";

const LOAD_SET = {
  entries: [
    {
      path: ".arc/reference/briefs/AGENT-BRIEF.ARC.md",
      readMode: { kind: "full" },
    },
    {
      path: ".arc/reference/QUICK-REFERENCE.md",
      readMode: {
        kind: "partial-section",
        heading: "Environment & Path Context",
      },
    },
    {
      path: ".arc/active/tasks-compaction-recovery.md",
      readMode: { kind: "partial-strategic" },
    },
  ],
} satisfies LoadSetManifest;

function seed(overrides: Partial<CompactionSeed> = {}): CompactionSeed {
  return {
    schemaVersion: COMPACTION_SEED_SCHEMA_VERSION,
    emittedAt: "2026-06-28T12:00:00.000Z",
    repoRoot: "/repo",
    branch: "feat/compaction-recovery",
    head: "72d145021bf4166fa70efc5b9fd11916cf0a359a",
    dirty: true,
    activeWorkUnit: "compaction-recovery",
    metaPath: ".arc/active/meta-compaction-recovery.md",
    sessionType: "execution",
    currentWorkflow: null,
    taskCursor: {
      section: {
        id: "2.1",
        title: "Define the `CompactionSeed` schema",
        lineHint: 66,
      },
      leaf: {
        id: "2.1.a",
        title: "Add schema runtime guard",
        lineHint: 70,
      },
    },
    loadSet: LOAD_SET,
    uncommittedFiles: [
      ".arc/active/tasks-compaction-recovery.md",
      "packages/arc-framework/src/lib/compaction-seed/schema.ts",
    ],
    ...overrides,
  };
}

describe("CompactionSeed schema", () => {
  it("pins the schema version literal", () => {
    const version: CompactionSeedSchemaVersion = 1;

    expect(version).toBe(COMPACTION_SEED_SCHEMA_VERSION);
  });

  it("accepts a seed carrying the shared load-set manifest type", () => {
    const value = seed();

    expect(isCompactionSeed(value)).toBe(true);
    expect(value.loadSet.entries.map((entry) => entry.readMode.kind)).toEqual([
      "full",
      "partial-section",
      "partial-strategic",
    ]);
  });

  it("accepts null WU pointers for between-unit recovery state", () => {
    expect(
      isCompactionSeed(seed({
        activeWorkUnit: null,
        metaPath: null,
        sessionType: null,
        currentWorkflow: null,
        taskCursor: null,
      })),
    ).toBe(true);
  });

  it("parses a valid JSON seed", () => {
    const value = seed();

    expect(parseCompactionSeedJson(JSON.stringify(value))).toEqual({
      ok: true,
      seed: value,
    });
  });

  it("stringifies with a trailing newline and round-trips losslessly", () => {
    const value = seed({ dirty: false, uncommittedFiles: [] });
    const content = stringifyCompactionSeed(value);

    expect(content.endsWith("\n")).toBe(true);
    expect(parseCompactionSeedJson(content)).toEqual({
      ok: true,
      seed: value,
    });
  });

  it("rejects malformed JSON with a typed error", () => {
    const result = parseCompactionSeedJson("{not-json");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("malformed-json");
    }
  });

  it("rejects unknown schema versions with the actual version", () => {
    const result = parseCompactionSeedJson(JSON.stringify({ ...seed(), schemaVersion: 2 }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("schema-version-mismatch");
      expect(result.error.actualVersion).toBe(2);
    }
  });

  it("rejects invalid session types", () => {
    const result = parseCompactionSeedJson(
      JSON.stringify({ ...seed(), sessionType: "errand" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid-schema");
    }
  });

  it("rejects invalid task cursors", () => {
    const result = parseCompactionSeedJson(
      JSON.stringify({
        ...seed(),
        taskCursor: {
          section: {
            id: "2.1",
            title: "Define schema",
            lineHint: 0,
          },
          leaf: {
            id: "2.1",
            title: "Define schema",
            lineHint: 1,
          },
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid-schema");
    }
  });

  it("rejects load-set entries outside the shared read-mode vocabulary", () => {
    const result = parseCompactionSeedJson(
      JSON.stringify({
        ...seed(),
        loadSet: {
          entries: [
            {
              path: ".arc/reference/QUICK-REFERENCE.md",
              readMode: { kind: "partial-file" },
            },
          ],
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid-schema");
    }
  });
});
