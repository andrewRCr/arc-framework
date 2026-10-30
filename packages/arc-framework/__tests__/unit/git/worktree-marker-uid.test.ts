/** Work-unit marker generations are UUIDs and never part of terminal husk subjects. */
import { expect, it } from "vitest";
import { decodeWorktreeMarkerOwnership, isWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";

const uid = "10000000-0000-4000-8000-000000000001";
const marker = { spawnedByArc: true, createdFor: { kind: "work-unit", name: "widget", uid },
  spawningIdentity: "andrew", createdAt: "2026-10-24T00:00:00.000Z" } as const;

it.each(["not-a-uuid", "a".repeat(32), 42, null])("rejects a non-UUID work-unit generation: %j", invalid => {
  expect(isWorktreeMarker({ ...marker, createdFor: { ...marker.createdFor, uid: invalid } })).toBe(false);
});

it("decodes the typed work-unit UID with the marker's name", () => {
  expect(isWorktreeMarker(marker)).toBe(true);
  const decoded = decodeWorktreeMarkerOwnership(marker);
  expect(decoded).toEqual({ kind: "current", subject: marker.createdFor, provisioning: null });
  if (decoded.kind !== "current" || decoded.subject.kind !== "work-unit") throw new Error("Expected a work-unit subject");
  expect(decoded.subject.uid).toBe(uid);
});

it("rejects a husk subject that includes a live work-unit UID", () => {
  expect(isWorktreeMarker({ ...marker, husk: { sha: "a".repeat(40), at: "2026-10-24T00:00:00.000Z",
    subject: marker.createdFor, branch: "feat/widget" } })).toBe(false);
});
