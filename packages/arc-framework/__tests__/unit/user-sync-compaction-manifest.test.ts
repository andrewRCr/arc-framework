import { describe, expect, it } from "vitest";

import {
  NOTES_COMPACTION_MANIFEST_PATH,
  buildNextNotesCompactionManifest,
  deserializeNotesCompactionManifest,
  isPairPrunedByManifest,
  serializeNotesCompactionManifest,
} from "../../src/lib/user-sync/compaction-manifest.js";

const blobA = "a".repeat(40);
const blobB = "b".repeat(40);
const blobC = "c".repeat(40);
const commitA = "1".repeat(40);
const commitB = "2".repeat(40);
const commitC = "3".repeat(40);

describe("notes compaction manifest", () => {
  it("uses a reserved non-note path", () => {
    expect(NOTES_COMPACTION_MANIFEST_PATH).not.toMatch(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
  });

  it("carries cumulative pruned pairs into each new generation", () => {
    const first = buildNextNotesCompactionManifest({
      previous: null,
      preCompactionTip: "f".repeat(40),
      pruned: [
        { blob: blobA, commit: commitA },
        { blob: blobB, commit: commitB },
      ],
    });
    const second = buildNextNotesCompactionManifest({
      previous: first,
      preCompactionTip: "e".repeat(40),
      pruned: [
        { blob: blobB, commit: commitB },
        { blob: blobC, commit: commitC },
      ],
    });

    expect(first.generation).toBe(1);
    expect(second.generation).toBe(2);
    expect(second.pruned).toEqual([
      { blob: blobA, commit: commitA },
      { blob: blobB, commit: commitB },
      { blob: blobC, commit: commitC },
    ]);
  });

  it("round-trips through a stable serialized shape", () => {
    const manifest = buildNextNotesCompactionManifest({
      previous: null,
      preCompactionTip: "f".repeat(40),
      pruned: [{ blob: blobA, commit: commitA }],
    });

    const serialized = serializeNotesCompactionManifest(manifest);

    expect(serialized).toBe(`${JSON.stringify(manifest, null, 2)}\n`);
    expect(deserializeNotesCompactionManifest(serialized)).toEqual(manifest);
  });

  it("rejects malformed or unsupported manifests at the trust boundary", () => {
    expect(deserializeNotesCompactionManifest("{bad json")).toBeNull();
    expect(deserializeNotesCompactionManifest(JSON.stringify({ version: 2 }))).toBeNull();
    expect(deserializeNotesCompactionManifest(JSON.stringify({
      version: 1,
      generation: 1,
      preCompactionTip: null,
      pruned: [{ blob: "not-a-blob", commit: commitA }],
    }))).toBeNull();
  });

  it("matches pruned pairs by blob and annotated commit", () => {
    const manifest = buildNextNotesCompactionManifest({
      previous: null,
      preCompactionTip: null,
      pruned: [{ blob: blobA, commit: commitA }],
    });

    expect(isPairPrunedByManifest(manifest, { blob: blobA, commit: commitA })).toBe(true);
    expect(isPairPrunedByManifest(manifest, { blob: blobA, commit: commitB })).toBe(false);
    expect(isPairPrunedByManifest(manifest, { blob: blobB, commit: commitA })).toBe(false);
  });
});
