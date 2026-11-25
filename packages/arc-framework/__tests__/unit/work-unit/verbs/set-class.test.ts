/** Classification persists at the selected placement and defaults only to the checkout's held unit. */
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { runSetClass } from "../../../../src/lib/work-unit/verbs/set-class.js";
import { writeWorktreeOwnershipMarker } from "../../../../src/lib/git/worktree-marker.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import type { WritePlacement } from "../../../../src/lib/store/index.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
it.each(["stub", "active", "archived"] as const)("classifies an %s unit at the placement it read", async (kind) => {
  const { store, seedMeta } = createLifecycleHarness();
  const placement: WritePlacement = kind === "stub" ? { kind: "backlog", commitment: "provisional" }
    : kind === "active" ? { kind: "active" } : { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") };
  const record = await seedMeta("example", { state: kind === "archived" ? "Shipped" : kind === "stub" ? "Planning" : "Active",
    currentWorkflow: kind === "active" ? "process-task-loop" : null }, placement);
  expect(await runSetClass({ cwd: "/checkout", store }, { name: "example", workClass: "Novel" })).toEqual({ status: "ok", name: "example", workClass: "Novel" });
  expect(lifecycleSuccess(await store.read({ reference: record.reference }))).toMatchObject({ placement: record.placement, fields: { workClass: "Novel" } });
});
it("defaults the slug to the active work unit claimed by this checkout", async () => {
  const { store, seedMeta } = createLifecycleHarness();
  const record = await seedMeta("example");
  await seedMeta("other");
  const cwd = await mkdtemp(join(tmpdir(), "arc-set-class-")); roots.push(cwd);
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: boundWorkUnitSubject(record), spawningIdentity: "test-user" });
  expect(await runSetClass({ cwd, store }, { workClass: "Heavy" })).toMatchObject({ status: "ok", name: "example" });
  expect(lifecycleSuccess(await store.read({ reference: record.reference })).fields).toMatchObject({ workClass: "Heavy" });
});
it("retains the store's refusal code and remedy for a missing unit", async () => {
  const { store } = createLifecycleHarness();
  expect(await runSetClass({ cwd: "/checkout", store }, { name: "missing", workClass: "Light" }))
    .toMatchObject({ status: "rejected", refusal: { code: "not-found", remedy: { text: expect.any(String) } } });
});

it("refuses ambient classification with unbound recovery exits and succeeds after binding", async () => {
  const h = createLifecycleHarness(), record = await h.seedMeta("example");
  const cwd = await mkdtemp(join(tmpdir(), "arc-set-class-unbound-")); roots.push(cwd);
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: { kind: "work-unit", name: "example" }, spawningIdentity: "test-user" });
  const before = lifecycleSuccess(await h.store.version());
  const result = await runSetClass({ cwd, store: h.store }, { workClass: "Heavy" });
  expect(result).toMatchObject({ status: "rejected", reason: expect.stringContaining("arc materialize example --here") });
  expect(result).toMatchObject({ reason: expect.stringContaining("arc locus release") });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: boundWorkUnitSubject(record), spawningIdentity: "test-user" });
  expect(await runSetClass({ cwd, store: h.store }, { workClass: "Heavy" })).toMatchObject({ status: "ok", name: "example", workClass: "Heavy" });
  expect(lifecycleSuccess(await h.store.read({ reference: record.reference })).fields).toMatchObject({ workClass: "Heavy" });
});
