/**
 * Unit tests for the sync-state marker schema — the serialize/parse boundary
 * for the per-machine entry the sibling sync-state ref carries.
 *
 * Covers a lossless round-trip, rejection of malformed or partial blobs, and
 * narrowing of adversarial `unknown` input at the parse boundary (no `any`
 * trusted downstream).
 */

import { describe, it, expect } from "vitest";

import {
  serializeSyncStateMarker,
  deserializeSyncStateMarker,
  evaluateMarkerLiveness,
  isMarkerExpired,
  SYNC_STATE_MARKER_TTL_DAYS,
  type SyncStateMarker,
} from "../../src/lib/user-sync/sync-state-marker.js";

function markerFor(overrides: Partial<SyncStateMarker> = {}): SyncStateMarker {
  return {
    version: 1,
    machineId: "11111111-1111-4111-8111-111111111111",
    lastAttemptedCommit: "a".repeat(40),
    attemptTimestamp: "2026-06-25T12:00:00.000Z",
    intent: "b".repeat(40),
    ...overrides,
  };
}

describe("sync-state marker schema", () => {
  it("serializes and deserializes an entry without loss", () => {
    const marker = markerFor();

    expect(deserializeSyncStateMarker(serializeSyncStateMarker(marker))).toEqual(marker);
  });

  it("serializes to a stable, normalized field order (byte-identical re-write)", () => {
    const a = serializeSyncStateMarker(markerFor());
    const b = serializeSyncStateMarker(markerFor());

    expect(a).toBe(b);
    // A reordered source object serializes identically — the merge's byte-identity
    // idempotence depends on it.
    const reordered = serializeSyncStateMarker({
      intent: "b".repeat(40),
      attemptTimestamp: "2026-06-25T12:00:00.000Z",
      lastAttemptedCommit: "a".repeat(40),
      machineId: "11111111-1111-4111-8111-111111111111",
      version: 1,
    });
    expect(reordered).toBe(a);
  });

  it("rejects a non-JSON blob as null without throwing", () => {
    expect(deserializeSyncStateMarker("not json {")).toBeNull();
    expect(deserializeSyncStateMarker("")).toBeNull();
  });

  it("rejects a partial blob missing a required field", () => {
    const partial = markerFor();
    delete (partial as Partial<SyncStateMarker>).intent;

    expect(deserializeSyncStateMarker(`${JSON.stringify(partial)}\n`)).toBeNull();
  });

  it("rejects a wrong-version blob", () => {
    expect(deserializeSyncStateMarker(JSON.stringify({ ...markerFor(), version: 2 }))).toBeNull();
  });

  it("narrows adversarial unknown input at the boundary — non-objects and wrong types are null", () => {
    expect(deserializeSyncStateMarker("null")).toBeNull();
    expect(deserializeSyncStateMarker("42")).toBeNull();
    expect(deserializeSyncStateMarker('"a string"')).toBeNull();
    expect(deserializeSyncStateMarker("[]")).toBeNull();
    // Right shape, wrong field types.
    expect(deserializeSyncStateMarker(JSON.stringify({ ...markerFor(), machineId: 123 }))).toBeNull();
    expect(deserializeSyncStateMarker(JSON.stringify({ ...markerFor(), attemptTimestamp: "" }))).toBeNull();
  });
});

describe("evaluateMarkerLiveness", () => {
  const INTENT = "f".repeat(40);

  it("reports fulfilled when the notes ref has reached the entry's intent", () => {
    expect(evaluateMarkerLiveness(markerFor({ intent: INTENT }), INTENT)).toBe("fulfilled");
  });

  it("reports live when the notes ref has not reached the entry's intent", () => {
    expect(evaluateMarkerLiveness(markerFor({ intent: INTENT }), "a".repeat(40))).toBe("live");
    // An absent remote notes ref has reached nothing.
    expect(evaluateMarkerLiveness(markerFor({ intent: INTENT }), null)).toBe("live");
  });

  it("decides purely by ref comparison — the timestamp never changes the verdict", () => {
    const old = markerFor({ intent: INTENT, attemptTimestamp: "2000-01-01T00:00:00.000Z" });
    const recent = markerFor({ intent: INTENT, attemptTimestamp: "2026-06-25T12:00:00.000Z" });

    expect(evaluateMarkerLiveness(old, INTENT)).toBe(evaluateMarkerLiveness(recent, INTENT));
    expect(evaluateMarkerLiveness(old, "a".repeat(40))).toBe(evaluateMarkerLiveness(recent, "a".repeat(40)));
  });
});

describe("isMarkerExpired", () => {
  const NOW = "2026-06-25T12:00:00.000Z";

  it("ages out an entry older than the TTL window", () => {
    // Attempted 20 days before NOW — past the 14-day backstop.
    const stale = markerFor({ attemptTimestamp: "2026-06-05T12:00:00.000Z" });

    expect(isMarkerExpired(stale, NOW)).toBe(true);
  });

  it("retains an entry within the TTL window", () => {
    // Attempted 5 days before NOW — well inside the window.
    const fresh = markerFor({ attemptTimestamp: "2026-06-20T12:00:00.000Z" });

    expect(isMarkerExpired(fresh, NOW)).toBe(false);
  });

  it("reads the TTL day-count from config rather than a hardcoded call-site literal", () => {
    expect(SYNC_STATE_MARKER_TTL_DAYS).toBe(14);

    // 10 days old: retained under the default 14-day TTL, aged out under an
    // overriding 7-day TTL — proving the day-count is sourced, not baked in.
    const tenDaysOld = markerFor({ attemptTimestamp: "2026-06-15T12:00:00.000Z" });
    expect(isMarkerExpired(tenDaysOld, NOW)).toBe(false);
    expect(isMarkerExpired(tenDaysOld, NOW, 7)).toBe(true);
  });
});
