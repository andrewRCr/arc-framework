import { describe, expect, it } from "vitest";

import {
  COMPACTION_NEWEST_RETAIN_COUNT,
  COMPACTION_PRUNE_AGE_DAYS,
  decideNotesCompactionRetention,
  type RetentionPolicyNoteEntry,
} from "../../src/lib/user-sync/compaction-retention.js";

const objectId = (seed: string, offset: number): string =>
  (Number.parseInt(seed, 36) + offset).toString(16).padStart(40, "0");
const blob = (seed: string): string => objectId(seed, 1000);
const commit = (seed: string): string => objectId(seed, 2000);
const NOW = "2026-07-07T12:00:00.000Z";

function note(
  id: string,
  overrides: Partial<RetentionPolicyNoteEntry> = {},
): RetentionPolicyNoteEntry {
  return {
    blob: blob(id),
    commit: commit(id),
    committedAt: "2026-01-01T00:00:00.000Z",
    workUnitNames: ["old-wu"],
    archivedAt: "2026-01-01T00:00:00.000Z",
    inFlight: false,
    preMigrationRootSessionNotes: false,
    ...overrides,
  };
}

describe("notes compaction retention policy", () => {
  it("retains the newest notes regardless of age", () => {
    const entries = Array.from({ length: COMPACTION_NEWEST_RETAIN_COUNT + 2 }, (_, index) =>
      note(String(index + 1), {
        committedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      }));

    const result = decideNotesCompactionRetention({ entries, now: NOW });

    expect(result.retained.map((entry) => entry.commit)).toEqual(
      entries
        .slice(-COMPACTION_NEWEST_RETAIN_COUNT)
        .reverse()
        .map((entry) => entry.commit),
    );
    expect(result.pruned.map((entry) => entry.commit)).toEqual(
      entries
        .slice(0, 2)
        .reverse()
        .map((entry) => entry.commit),
    );
  });

  it("retains recently archived work and prunes it after the age gate", () => {
    const recent = note("a", { archivedAt: "2026-06-20T00:00:00.000Z" });
    const old = note("b", { archivedAt: "2026-05-01T00:00:00.000Z" });

    const result = decideNotesCompactionRetention({
      entries: [recent, old],
      now: NOW,
      newestRetainCount: 0,
      pruneAgeDays: COMPACTION_PRUNE_AGE_DAYS,
    });

    expect(result.retained).toEqual([recent]);
    expect(result.pruned).toEqual([old]);
  });

  it("rejects an invalid current timestamp instead of bypassing the age gate", () => {
    expect(() => decideNotesCompactionRetention({
      entries: [note("a", { archivedAt: "2026-06-20T00:00:00.000Z" })],
      now: "not-a-date",
      newestRetainCount: 0,
    })).toThrow("invalid `now` timestamp");
  });

  it("keeps in-flight work while pruning pre-migration root session notes unconditionally", () => {
    const inFlight = note("a", {
      archivedAt: null,
      inFlight: true,
      workUnitNames: ["active-wu"],
    });
    const preMigration = note("b", {
      preMigrationRootSessionNotes: true,
      committedAt: "2026-07-07T00:00:00.000Z",
      archivedAt: null,
      inFlight: true,
      workUnitNames: [],
    });

    const result = decideNotesCompactionRetention({
      entries: [inFlight, preMigration],
      now: NOW,
      newestRetainCount: 10,
    });

    expect(result.retained).toEqual([inFlight]);
    expect(result.pruned).toEqual([preMigration]);
  });
});
