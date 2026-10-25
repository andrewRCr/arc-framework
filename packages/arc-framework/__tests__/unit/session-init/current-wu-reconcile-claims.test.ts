/** Session reconciliation acquires the checkout's exact owner rather than a clashed display name. */
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, onTestFinished } from "vitest";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../../helpers/store/clash-double.js";
import { readWorktreeMarkerGeneration, removeWorktreeMarkerGeneration, writeWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { runCurrentWuReconcileSessionProbe } from "../../../src/lib/session-init/current-wu-reconcile.js";
import { boundWorkUnitCheckout } from "../../helpers/store/bound-checkout.js";

it.each([false, true])("session reconcile reads its bound holder through a current-name clash, second=%s", async second => {
  const cwd = await mkdtemp(join(tmpdir(), "reconcile-claim-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  const h = createLifecycleHarness();
  await h.seedMeta("first-dependency"); await h.seedMeta("other-dependency");
  const first = await h.seedMeta("first", { dependsOn: ["first-dependency"] });
  const other = await h.seedMeta("other", { dependsOn: ["other-dependency"] });
  const owner = (second ? other : first).reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected the checkout owner's UID");
  const store = createClashDouble(h.store, { slug: "example", holders: [first.reference, other.reference] });
  await writeWorktreeMarker(cwd, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "example", uid: owner.uid },
    spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" });
  expect(await runCurrentWuReconcileSessionProbe({ store }, { slug: "example", metaPath: "stale-path.md", checkoutPath: cwd }))
    .toMatchObject({ status: "clean", slug: "example", dependency: {
      before: [second ? "other-dependency" : "first-dependency"], after: [second ? "other-dependency" : "first-dependency"],
    } });
});

it("withholds session reconciliation without a marker and resumes after its binding is restored", async () => {
  const h = createLifecycleHarness(), record = await h.seedMeta("example"), cwd = await boundWorkUnitCheckout(record);
  const generation = await readWorktreeMarkerGeneration(cwd);
  if (generation.kind !== "present") throw new Error("Expected the bound marker fixture");
  expect(await removeWorktreeMarkerGeneration(cwd, generation.bytes)).toEqual({ kind: "removed" });
  const op = { slug: "example", metaPath: "stale-path.md", checkoutPath: cwd };
  expect(await runCurrentWuReconcileSessionProbe({ store: h.store }, op)).toMatchObject({ status: "unavailable",
    condition: expect.stringContaining("does not hold an active work-unit claim"),
    actions: [{ text: expect.stringMatching(/Inspect arc locus.*repair.*retry/isu) }] });
  await writeWorktreeMarker(cwd, generation.marker);
  expect(await runCurrentWuReconcileSessionProbe({ store: h.store }, op)).toMatchObject({ status: "clean", slug: "example" });
});

it("reports unbound recovery exits and reconciles after restoring the bound marker", async () => {
  const h = createLifecycleHarness(), record = await h.seedMeta("example"), cwd = await boundWorkUnitCheckout(record);
  const generation = await readWorktreeMarkerGeneration(cwd);
  if (generation.kind !== "present") throw new Error("Expected bound fixture marker");
  await writeWorktreeMarker(cwd, { spawnedByArc: generation.marker.spawnedByArc, spawningIdentity: generation.marker.spawningIdentity,
    createdAt: generation.marker.createdAt, createdFor: { kind: "work-unit", name: "example" } });
  const op = { slug: "example", metaPath: "stale-path.md", checkoutPath: cwd };
  expect(await runCurrentWuReconcileSessionProbe({ store: h.store }, op)).toMatchObject({ status: "unavailable",
    condition: expect.stringContaining("unbound"), actions: [
      { argv: ["arc", "materialize", "example", "--here"], checkout: cwd },
      { argv: ["arc", "locus", "release"], checkout: cwd },
    ] });
  await writeWorktreeMarker(cwd, generation.marker);
  expect(await runCurrentWuReconcileSessionProbe({ store: h.store }, op)).toMatchObject({ status: "clean", slug: "example" });
});
