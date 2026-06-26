import { describe, it, expect } from "vitest";

import {
  runPartialPushMarkerSurface,
  selectAwareMarkers,
} from "../../../src/lib/session-init/partial-push-marker-surface.js";
import {
  serializeSyncStateMarker,
  type SyncStateMarker,
} from "../../../src/lib/user-sync/sync-state-marker.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const NOW = "2026-06-26T12:00:00.000Z";

/** A marker whose intent is unfulfilled (differs from the notes-ref tip below). */
function marker(overrides: Partial<SyncStateMarker> = {}): SyncStateMarker {
  return {
    version: 1,
    machineId: "machine-a",
    lastAttemptedCommit: "abc1234def5678",
    attemptTimestamp: NOW,
    intent: "notes-intent-sha",
    ...overrides,
  };
}

/** Origin's notes-ref tip — distinct from the marker's intent, so the marker reads `live`. */
const NOTES_TIP_BEHIND = "older-notes-sha";

describe("selectAwareMarkers", () => {
  it("renders a live marker from its payload fields", () => {
    const result = selectAwareMarkers({
      markers: [marker()],
      notesRefTip: NOTES_TIP_BEHIND,
      now: NOW,
    });

    expect(result.markers).toEqual([
      {
        machineId: "machine-a",
        lastAttemptedCommit: "abc1234def5678",
        attemptTimestamp: NOW,
      },
    ]);
  });

  it("stays silent when the marker's intent is fulfilled at origin", () => {
    const result = selectAwareMarkers({
      markers: [marker({ intent: "landed-notes-sha" })],
      notesRefTip: "landed-notes-sha",
      now: NOW,
    });

    expect(result.markers).toEqual([]);
  });

  it("ages out a live marker older than the 14-day TTL backstop", () => {
    const result = selectAwareMarkers({
      markers: [marker({ attemptTimestamp: "2026-06-10T12:00:00.000Z" })],
      notesRefTip: NOTES_TIP_BEHIND,
      now: NOW,
    });

    expect(result.markers).toEqual([]);
  });

  it("keeps a live marker just inside the TTL window and drops a sibling just outside", () => {
    const result = selectAwareMarkers({
      markers: [
        marker({ machineId: "fresh", attemptTimestamp: "2026-06-13T12:00:00.000Z" }),
        marker({ machineId: "stale", attemptTimestamp: "2026-06-12T11:59:00.000Z" }),
      ],
      notesRefTip: NOTES_TIP_BEHIND,
      now: NOW,
    });

    expect(result.markers.map((m) => m.machineId)).toEqual(["fresh"]);
  });
});

/**
 * git stub driving the IO composition: `ls-tree` lists the ref's machine keys,
 * `cat-file -p <ref>:<key>` returns each entry's serialized blob, and
 * `rev-parse --verify <notes-ref>` returns origin's notes-ref tip. A `null`
 * `notesTip` makes the notes ref unresolvable; omitting an entry from `entries`
 * makes the sync-state ref absent.
 */
function buildExec(opts: {
  entries?: Record<string, SyncStateMarker>;
  notesTip?: string | null;
}): GitExec {
  const entries = opts.entries ?? {};
  const notesTip = opts.notesTip === undefined ? NOTES_TIP_BEHIND : opts.notesTip;
  return (async (_cmd: string, args: string[]) => {
    if (args[0] === "ls-tree") {
      const keys = Object.keys(entries);
      if (keys.length === 0) throw new Error("ref absent");
      const stdout = keys.map((key) => `100644 blob ${"0".repeat(40)}\t${key}`).join("\n");
      return { stdout, stderr: "" };
    }
    if (args[0] === "cat-file") {
      const ref = args[2] ?? "";
      const key = ref.slice(ref.lastIndexOf(":") + 1);
      const entry = entries[key];
      if (entry === undefined) throw new Error("entry absent");
      return { stdout: serializeSyncStateMarker(entry), stderr: "" };
    }
    if (args[0] === "rev-parse") {
      if (notesTip === null) throw new Error("notes ref absent");
      return { stdout: `${notesTip}\n`, stderr: "" };
    }
    throw new Error(`unexpected git invocation: ${args.join(" ")}`);
  }) as GitExec;
}

describe("runPartialPushMarkerSurface", () => {
  it("surfaces a sibling's live marker read from the ref", async () => {
    const result = await runPartialPushMarkerSurface({
      exec: buildExec({ entries: { "machine-a": marker() } }),
      identity: "andrew",
      now: NOW,
    });

    expect(result.markers).toEqual([
      {
        machineId: "machine-a",
        lastAttemptedCommit: "abc1234def5678",
        attemptTimestamp: NOW,
      },
    ]);
  });

  it("degrades silent when the sync-state ref is absent", async () => {
    const exec = buildExec({ entries: {} });
    const result = await runPartialPushMarkerSurface({ exec, identity: "andrew", now: NOW });

    expect(result.markers).toEqual([]);
  });

  it("stays silent when origin's notes ref has reached the marker's intent", async () => {
    const result = await runPartialPushMarkerSurface({
      exec: buildExec({
        entries: { "machine-a": marker({ intent: "landed" }) },
        notesTip: "landed",
      }),
      identity: "andrew",
      now: NOW,
    });

    expect(result.markers).toEqual([]);
  });
});
