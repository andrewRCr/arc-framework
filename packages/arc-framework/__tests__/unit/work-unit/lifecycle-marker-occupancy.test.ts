/** In-place lifecycle claims refuse roles hidden by current-work-unit resolution. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { makeWorktreeOccupancyGuard } from "../../../src/lib/work-unit/lifecycle-guards.js";
import { writeWorktreeMarker, writeWorktreeOwnershipMarker, stampWorktreeHusk } from "../../../src/lib/git/worktree-marker.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "arc-marker-occupancy-"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const h = createLifecycleHarness();
  const guard = makeWorktreeOccupancyGuard({ cwd, store: h.store,
    readActiveMetaCandidates: async () => ({ layout: "full", candidates: [], warnings: [] }) });
  return { ...h, cwd, guard: () => guard({ slug: "target", index: new Map(), position: null, inputs: {} }) };
}

it("refuses a partial Errand marker naming its finish, promote and abandon exits", async () => {
  const h = await fixture();
  await writeWorktreeMarker(h.cwd, { spawnedByArc: false, createdFor: { kind: "partial-errand", slug: "errand", claimId: null },
    provisioning: "ready", spawningIdentity: "andrew", createdAt: new Date(0).toISOString() });
  expect(await h.guard()).toMatchObject({ ok: false, message: expect.stringMatching(/finish.*promote.*abandon/iu) });
});

it("refuses a crashed anchored cold start naming both recovery exits", async () => {
  const h = await fixture();
  await writeWorktreeMarker(h.cwd, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "crashed" },
    spawningIdentity: "andrew", createdAt: new Date(0).toISOString() });
  expect(await h.guard()).toMatchObject({ ok: false, message: expect.stringContaining("arc start crashed --new --here") });
  expect(await h.guard()).toMatchObject({ ok: false, message: expect.stringContaining("arc locus release crashed") });
});

it("refuses a husk marker naming teardown", async () => {
  const h = await fixture();
  await writeWorktreeOwnershipMarker(h.cwd, { createdByArc: true, createdFor: { kind: "work-unit", name: "old" }, spawningIdentity: "andrew", now: 0 });
  await stampWorktreeHusk(h.cwd, { sha: "a".repeat(40), at: new Date(0).toISOString(), subject: { kind: "work-unit", name: "old" }, branch: "feat/old" });
  expect(await h.guard()).toMatchObject({ ok: false, message: expect.stringContaining("arc teardown old") });
});
