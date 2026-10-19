/** Digest and observed-version origin bindings remain mutually exclusive. */
import { expect, it, onTestFinished } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isWorktreeMarker, writeWorktreeMarker, readWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { parseOccupancyMarker, serializeOccupancyMarker } from "../../../src/lib/locus/occupancy-marker.js";

const binding = { spawnedByArc: false, createdFor: { kind: "partial-errand" as const, slug: "repair", claimId: null },
  provisioning: "ready" as const, originEntry: "personal:abcd1234", originEntryVersion: "v1:0123456789abcdef" };
const raw = { ...binding, spawningIdentity: "andrew", createdAt: "2026-10-16T00:00:00.000Z" };
it("round-trips a version-bound raw marker", async () => {
  expect(isWorktreeMarker(raw)).toBe(true);
  const cwd = await mkdtemp(join(tmpdir(), "arc-origin-marker-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  await writeWorktreeMarker(cwd, raw);
  expect(await readWorktreeMarker(cwd)).toEqual({ kind: "present", marker: raw });
});
it("round-trips a version-bound occupancy projection", () => {
  expect(parseOccupancyMarker(serializeOccupancyMarker(binding))).toEqual({ kind: "valid", marker: binding });
});
it("rejects two competing origin bases in a raw marker", () => {
  expect(isWorktreeMarker({ ...raw, originEntrySourceDigest: `sha256:${"a".repeat(64)}` })).toBe(false);
});
it("rejects two competing origin bases in an occupancy projection", () => {
  expect(parseOccupancyMarker(JSON.stringify({ ...binding, originEntrySourceDigest: `sha256:${"a".repeat(64)}` })).kind)
    .toBe("malformed");
});
