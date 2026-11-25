/** A failed post-creation marker write preserves its unbound generation and names the binding exit. */
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { stampCreatedWorkUnitMarker } from "../../../src/lib/work-unit/created-work-unit-marker.js";
import { createWorktreeMarkerGeneration, resolveWorktreeMarkerPath } from "../../../src/lib/git/worktree-marker.js";
import { OwnerIdentitySchema } from "../../../src/lib/store/identity.js";

it("retains an unbound marker when the stamp's filesystem write fails", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "creation-stamp-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  const created = await createWorktreeMarkerGeneration(cwd, { spawnedByArc: false, spawningIdentity: "starter",
    createdAt: "2026-10-24T00:00:00Z", createdFor: { kind: "work-unit", name: "created" } });
  if (created.kind !== "created") throw new Error("Expected the initial marker");
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "created", uid: randomUUID() });
  const result = await stampCreatedWorkUnitMarker({ cwd, name: "created", expected: created.bytes, owner },
    async () => { throw new Error("Marker filesystem unavailable"); });
  expect(result).toContain("Marker filesystem unavailable");
  expect(result).toContain("arc materialize created --here");
  expect(await readFile(resolveWorktreeMarkerPath(cwd))).toEqual(created.bytes);
});
