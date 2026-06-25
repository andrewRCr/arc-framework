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
