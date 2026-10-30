/** Unbound checkout recovery names every generation and offers only admitted exits. */
import { expect, it } from "vitest";
import { classifyUnboundMarker } from "../../../src/lib/locus/unbound-marker.js";
import type { WorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { SessionActionsSchema } from "../../../src/lib/session-init/actions.js";
import { createDecomposeHarness } from "../../helpers/store/decompose-harness.js";
function marker(spawnedByArc = false, name = "example") {
  return { spawnedByArc, createdFor: { kind: "work-unit" as const, name }, spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" } satisfies WorktreeMarker;
}
it.each([false, true])("offers binding beside both generations for an owned unbound marker, spawned=%s", async spawned => {
  const h = createDecomposeHarness(), archived = await h.seedCompletedWorkUnit("example");
  const live = await h.seedMeta("example", { state: "Planning", owner: "test-user", currentWorkflow: "draft-design" });
  const result = await classifyUnboundMarker({ store: h.store, cwd: "/checkout", marker: marker(spawned), identity: "test-user" });
  expect(result).toMatchObject({ kind: "unbound", slug: "example", exit: { kind: "bind", reference: live.reference, owner: "test-user" },
    holders: expect.arrayContaining([archived.reference, live.reference]), exits: [
      { argv: ["arc", "materialize", "example", "--here"], checkout: "/checkout" },
      { argv: ["arc", "locus", "release"], checkout: "/checkout" },
    ] });
  if (result.kind !== "unbound") throw new Error(result.reason);
  expect(result.holders).toHaveLength(2);
  for (const record of [archived, live]) {
    if (record.reference.owner.type === "person" || record.reference.owner.uid === undefined) throw new Error("Expected holder UUID");
    expect(result.reason).toContain(record.reference.owner.uid);
  }
  expect(result.reason).toContain("arc materialize example --here");
  expect(result.reason).toContain("arc locus release");
  expect(SessionActionsSchema.safeParse(result.exits).success).toBe(true);
});
it("names the live holder's owner when classification has no identity", async () => {
  const h = createDecomposeHarness();
  await h.seedMeta("example", { owner: "alice" });
  const result = await classifyUnboundMarker({ store: h.store, cwd: "/checkout", marker: marker() });
  expect(result).toMatchObject({ kind: "unbound", exit: { kind: "bind", owner: "alice" }, exits: [
    { text: expect.stringContaining("alice"), argv: ["arc", "materialize", "example", "--here"], checkout: "/checkout" },
    { argv: ["arc", "locus", "release"], checkout: "/checkout" },
  ] });
});
it("offers binding under the live holder's current name when the marker names a former slug", async () => {
  const h = createDecomposeHarness(), renamed = await h.seedRenamedWorkUnit("example", "current");
  const { recordPut } = await import("../../../src/lib/store/lifecycle-write.js");
  const { renderMetaFile } = await import("../../../src/lib/store/kinds/meta/writers.js");
  const { lifecycleSuccess } = await import("../../helpers/store/lifecycle-harness.js");
  lifecycleSuccess(await h.store.write({ ...recordPut(renamed, { placement: { kind: "active" }, content: renderMetaFile("current", {
    owner: "test-user", state: "Planning", workClass: "Light", currentWorkflow: "draft-design" }) }), provenance: { verb: "fixture", lifecycleAction: "arrange" } }));
  const result = await classifyUnboundMarker({ store: h.store, cwd: "/checkout", marker: marker(), identity: "test-user" });
  expect(result).toMatchObject({ kind: "unbound", slug: "example", exit: { kind: "bind", reference: renamed.reference },
    holders: [renamed.reference], exits: [{ argv: ["arc", "materialize", "current", "--here"], checkout: "/checkout" },
      { argv: ["arc", "locus", "release"], checkout: "/checkout" }] });
});
it("offers cold-start rerun or unnamed release for an anchored marker with no primary or lineage", async () => {
  const h = createDecomposeHarness();
  expect(await classifyUnboundMarker({ store: h.store, cwd: "/checkout", marker: marker() })).toMatchObject({ kind: "unbound", slug: "example",
    holders: [], exit: { kind: "rerun" }, exits: [{ argv: ["arc", "start", "example", "--new", "--here"], checkout: "/checkout" },
      { argv: ["arc", "locus", "release"], checkout: "/checkout" }] });
});
it.each(["spawned", "completed", "retired", "foreign-owner", "backlog", "errand", "cohort", "ambiguous", "lookup-refused"] as const)(
  "offers unnamed release alone for %s unbound occupancy", async kind => {
    const h = createDecomposeHarness();
    if (kind === "completed") await h.seedCompletedWorkUnit("example");
    if (kind === "retired") await h.seedRetiredWorkUnit("example");
    if (kind === "foreign-owner") await h.seedMeta("example", { owner: "alice" });
    if (kind === "backlog") await h.seedStub("example");
    if (kind === "cohort") await h.seedCohort("example");
    if (kind === "ambiguous") { await h.seedMeta("example"); await h.seedCohort("example"); }
    if (kind === "errand") {
      const { recordReferences, OwnerIdentitySchema } = await import("../../../src/lib/store/identity.js");
      const { transientContent } = await import("../../helpers/store/in-repo-substrates.js");
      const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" }));
      await h.seed(reference, transientContent(reference), { kind: "active" });
    }
    if (kind === "lookup-refused") {
      await h.seedMeta("example");
      const lookup = h.store.lookup.bind(h.store);
      h.store.lookup = async input => input.kind === "slug" ? { status: "refused", refusal: { code: "lock-held", class: "recoverable",
        lock: "namespace", condition: "Namespace is locked.", remedy: { text: "Release the namespace lock, then retry." } } } : lookup(input);
    }
    const result = await classifyUnboundMarker({ store: h.store, cwd: "/checkout", marker: marker(kind === "spawned"), identity: "test-user" });
    expect(result).toMatchObject({ kind: "unbound", exit: { kind: "release" }, exits: [
      { argv: ["arc", "locus", "release"], checkout: "/checkout" }] });
    if (result.kind !== "unbound") throw new Error(result.reason);
    expect(result.exits).toHaveLength(1);
    expect(result.reason).toContain("arc locus release");
    expect(result.reason).not.toMatch(/arc materialize|arc start/iu);
    if (kind === "ambiguous") expect(result.holders).toHaveLength(2);
  });
it.each(["missed", "diagnostic", "unreadable", "refused"] as const)("refuses a %s work-unit inventory, then classifies after repair", async kind => {
  const h = createDecomposeHarness();
  await h.seedMeta("example");
  const list = h.store.list.bind(h.store);
  const remedy = { text: "Repair the missing work-unit inventory entry." };
  h.store.list = async input => {
    const result = await list(input);
    if (input.kind !== "work-item/meta" || result.status !== "ok" || result.result.status !== "complete") return result;
    if (kind === "unreadable") return { status: "ok", result: { status: "unreadable", condition: "Inventory is unreadable.", remedy } };
    if (kind === "refused") return { status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: "inventory", condition: "Inventory is locked.", remedy } };
    return { status: "ok", result: { ...result.result, missed: kind === "missed", diagnostics: kind === "diagnostic" ? [
      { kind: "unreadable", key: "missing-owner", condition: "Inventory is incomplete.", remedy }] : [] } };
  };
  expect(await classifyUnboundMarker({ store: h.store, cwd: "/checkout", marker: marker(), identity: "test-user" }))
    .toMatchObject({ kind: "unreadable", reason: expect.stringMatching(/inventory/iu) });
  h.store.list = list;
  expect(await classifyUnboundMarker({ store: h.store, cwd: "/checkout", marker: marker(), identity: "test-user" }))
    .toMatchObject({ kind: "unbound", exit: { kind: "bind" } });
});

it.each(["bound", "husk"] as const)("does not classify a %s marker as unbound", async kind => {
  const h = createDecomposeHarness(), primary = await h.seedMeta("example");
  if (primary.reference.owner.type === "person" || primary.reference.owner.uid === undefined) throw new Error("Expected owner UUID");
  const observed: WorktreeMarker = kind === "bound" ? { ...marker(), createdFor: { kind: "work-unit", name: "example", uid: primary.reference.owner.uid } }
    : { ...marker(), husk: { sha: "a".repeat(40), at: "2026-10-24T00:00:00Z", branch: "feat/example", subject: { kind: "work-unit", name: "example" } } };
  expect(await classifyUnboundMarker({ store: h.store, cwd: "/checkout", marker: observed, identity: "test-user" }))
    .toMatchObject({ kind: "unreadable", reason: expect.stringContaining("Expected an unbound work-unit marker") });
});
