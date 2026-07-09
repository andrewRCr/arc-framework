import { describe, expect, it } from "vitest";

import {
  deserializeNotesCompactionSyncMarker,
  serializeNotesCompactionSyncMarker,
  type NotesCompactionSyncMarker,
} from "../../src/lib/user-sync/index.js";

const PRE_TIP = "a".repeat(40);
const SNAPSHOT_TIP = "b".repeat(40);

describe("notes compaction sync-state marker", () => {
  it("round-trips the generation marker in a stable shape", () => {
    const marker: NotesCompactionSyncMarker = {
      version: 1,
      kind: "notes-compaction",
      generation: 3,
      preCompactionTip: PRE_TIP,
      snapshotTip: SNAPSHOT_TIP,
      publishedAt: "2026-07-07T00:00:00.000Z",
    };

    const serialized = serializeNotesCompactionSyncMarker(marker);

    expect(deserializeNotesCompactionSyncMarker(serialized)).toEqual(marker);
    expect(serialized).toBe(
      JSON.stringify(marker, null, 2) + "\n",
    );
  });

  it("rejects malformed marker blobs", () => {
    expect(deserializeNotesCompactionSyncMarker("not json")).toBeNull();
    expect(deserializeNotesCompactionSyncMarker(JSON.stringify({
      version: 1,
      kind: "notes-compaction",
      generation: 0,
      preCompactionTip: PRE_TIP,
      snapshotTip: SNAPSHOT_TIP,
      publishedAt: "2026-07-07T00:00:00.000Z",
    }))).toBeNull();
    expect(deserializeNotesCompactionSyncMarker(JSON.stringify({
      version: 1,
      kind: "other",
      generation: 1,
      preCompactionTip: PRE_TIP,
      snapshotTip: SNAPSHOT_TIP,
      publishedAt: "2026-07-07T00:00:00.000Z",
    }))).toBeNull();
  });
});
