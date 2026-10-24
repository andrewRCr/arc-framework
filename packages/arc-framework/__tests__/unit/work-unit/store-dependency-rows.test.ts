/** Store reconciliation classifies each edge against its resolved record. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { batchLifecycleWrites, recordPut, workUnitMetaPath } from "../../../src/lib/store/lifecycle-write.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/writer.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { writeMetaTitle } from "../../../src/lib/store/kinds/meta/writers.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../src/lib/kernel/index.js";
import { applyStoreCurrentWuReconcile, buildStoreCurrentWuReconcile } from "../../../src/lib/work-unit/store-current-wu-reconcile.js";
import { createStoreReconcilePrepareContext } from "../../../src/lib/work-unit/store-reconcile-context.js";
import { planDependencyReconcile, prepareCurrentWuReconcile } from "../../../src/lib/work-unit/side-effects/discharge-dep-edges.js";

async function renamed(h: ReturnType<typeof createLifecycleHarness>, completed = false) {
  const prior = await h.seedMeta("former", completed ? { state: "Shipped", currentWorkflow: null } : {},
    completed ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" });
  lifecycleSuccess(await h.store.write({ ...recordPut(prior, { content: writeMetaTitle(prior.content, SlugSchema.parse("current")) }),
    reference: { ...prior.reference, owner: OwnerIdentitySchema.parse({ ...prior.reference.owner, name: "current" }) },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  return lifecycleSuccess(await h.store.read({ reference: prior.reference }));
}

it("discharges a completed former-name holder when the dependent takes its current name", async () => {
  const h = createLifecycleHarness();
  await renamed(h, true);
  const dependent = await h.seedMeta("current", { dependsOn: ["former"] });
  const result = await buildStoreCurrentWuReconcile(h.store).prepare({ slug: "current", metaPath: workUnitMetaPath(dependent) });
  expect(result).toMatchObject({ status: "pending", prepared: { plan: { status: "ready", dependency: {
    after: [], discharged: ["former"], conflicts: [],
  } } } });
});

it.each([false, true])("keeps only live replacement targets and holds the whole edge if one cannot follow, hold=%s", async hold => {
  const h = createLifecycleHarness(), live = await renamed(h);
  const done = await h.seedMeta("omega", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const origin = await h.seedMeta("origin"), dependent = await h.seedMeta("dependent", { dependsOn: ["origin"] });
  if (live.reference.owner.type !== "work-item" || done.reference.owner.type !== "work-item") throw new Error("Expected work units");
  const targets = [{ name: SlugSchema.parse("former"), uid: live.reference.owner.uid },
    { name: done.reference.owner.name, uid: done.reference.owner.uid }];
  lifecycleSuccess(await batchLifecycleWrites(h.store, [
    { action: "remove", reference: origin.reference, expected: origin.version },
    { action: "put", reference: recordReferences["lineage/transition"](origin.reference.owner), expected: null,
      content: writeLineageRecord({ schemaVersion: 2, origin: { name: origin.reference.owner.name }, kind: "decompose", successors: targets,
        outgoing: [], incoming: [{ dependent: { name: dependent.reference.owner.name }, disposition: { kind: "replace", replacementTargets: targets } }] }) },
  ], { verb: "decompose", lifecycleAction: "decompose" }));
  const { context } = lifecycleSuccess(await createStoreReconcilePrepareContext(h.store, "dependent"));
  if (hold) {
    const lookup = h.store.lookup.bind(h.store);
    h.store.lookup = input => input.kind === "slug" && input.slug === "current"
      ? Promise.resolve({ status: "refused", refusal: { code: "not-found", class: "recoverable", lookup: input,
        condition: "Current name unavailable.", remedy: { text: "Restore the current name." } } }) : lookup(input);
  }
  const plan = await planDependencyReconcile({ ...context, dependentSlug: "dependent", edges: ["origin"] });
  expect(plan.status).toBe("ready");
  expect(plan.dependency.after).toEqual(hold ? ["origin"] : ["current"]);
  expect(plan.dependency.live).toEqual(hold ? [] : ["current"]);
  expect(plan.dependency.discharged).toEqual(hold ? [] : ["omega"]);
  if (hold) expect(plan.dependency.held).toMatchObject([{ edge: "origin", name: "current", cause: "unresolved-follow" }]);
  else expect(plan.dependency.replacements).toMatchObject([{ retiredSubject: "origin", replacementTargets: ["current"] }]);
});

it("keeps an edge on a reused slug live against its new holder", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("target", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  await h.seedMeta("target");
  const dependent = await h.seedMeta("dependent", { dependsOn: ["target"] });
  const result = await buildStoreCurrentWuReconcile(h.store).prepare({ slug: "dependent", metaPath: workUnitMetaPath(dependent) });
  expect(result).toMatchObject({ status: "clean", prepared: { plan: { dependency: {
    after: ["target"], live: ["target"], discharged: [], conflicts: [],
  } } } });
});

it.each([false, true])("follows a live former name only when the current name selects the same record, clash=%s", async clash => {
  const h = createLifecycleHarness(), target = await renamed(h);
  const dependent = await h.seedMeta("dependent", { dependsOn: ["former"] });
  const acquired = lifecycleSuccess(await createStoreReconcilePrepareContext(h.store, "dependent"));
  const { context } = acquired;
  const lookup = h.store.lookup.bind(h.store);
  const cohort = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "current", uid: "10000000-0000-4000-8000-000000000001" }));
  if (clash) h.store.lookup = input => input.kind === "slug" && input.slug === "current"
    ? Promise.resolve({ status: "refused", refusal: { code: "ambiguous-match", class: "recoverable", candidates: [target.reference, cohort],
      tie: { liveness: "live", name: "current" }, condition: "Two live holders.", remedy: { text: "Rename a holder." } } }) : lookup(input);
  const plan = await planDependencyReconcile({ ...context, dependentSlug: "dependent", edges: ["former"] });
  expect(plan.status).toBe("ready");
  expect(plan.dependency.after).toEqual(clash ? ["former"] : ["current"]);
  expect(plan.dependency.live).toEqual(clash ? [] : ["current"]);
  if (clash) expect(plan.dependency.held).toEqual([{ edge: "former", name: "current", cause: "unresolved-follow",
    candidates: [target.reference, cohort], tie: { liveness: "live", name: "current" },
    repair: { text: "Rename the cohort holder with `arc rename 10000000-0000-4000-8000-000000000001 <new-slug>`.", argv: ["arc", "status", "--json"] } }]);
  if (clash) {
    const prepared = await prepareCurrentWuReconcile({ ...context, additionalReferenceTransitions: [] },
      { slug: "dependent", metaPath: workUnitMetaPath(dependent) });
    prepared.prepared.storePlan = { records: acquired.records, writes: [] };
    expect(prepared).toMatchObject({ status: "pending", prepared: { edits: [], plan: { advisories: [], dependency: { held: plan.dependency.held } } } });
    expect(await applyStoreCurrentWuReconcile(h.store, prepared.prepared)).toMatchObject({ status: "pending" });
  }
  expect(lifecycleSuccess(await h.store.read({ reference: dependent.reference }))).toEqual(dependent);
});

it.each([false, true])("refuses operational lookup failures without rewriting any edge, follow=%s", async follow => {
  const h = createLifecycleHarness();
  if (follow) await renamed(h); else await h.seedMeta("target");
  await h.seedMeta("done", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  await h.seedMeta("dependent");
  const { context } = lifecycleSuccess(await createStoreReconcilePrepareContext(h.store, "dependent"));
  const lookup = h.store.lookup.bind(h.store);
  h.store.lookup = input => input.kind === "slug" && input.slug === (follow ? "current" : "target")
    ? Promise.resolve({ status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: "lookup",
      condition: "Lookup is locked.", remedy: { text: "Release the lock and retry." } } }) : lookup(input);
  const edges = ["done", follow ? "former" : "target"];
  expect(await planDependencyReconcile({ ...context, dependentSlug: "dependent", edges })).toMatchObject({ status: "conflict",
    dependency: { after: edges, discharged: [], conflicts: [{ reason: "namespace-corrupt", subject: follow ? "current" : "target" }] } });
});

it("refuses the dependent's own current name before consulting lookup", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("dependent");
  const { context } = lifecycleSuccess(await createStoreReconcilePrepareContext(h.store, "dependent"));
  h.store.lookup = async () => { throw new Error("Lookup is unavailable"); };
  expect(await planDependencyReconcile({ ...context, dependentSlug: "dependent", edges: ["dependent"] })).toMatchObject({ status: "conflict",
    dependency: { after: ["dependent"], conflicts: [{ edge: "dependent", subject: "dependent", reason: "self-dependency" }] } });
});

it("refuses a cycle among retired lineage names", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("dependent");
  for (const [name, successor] of [["first", "second"], ["second", "first"]]) {
    await h.seed(recordReferences["lineage/transition"](OwnerIdentitySchema.parse({ type: "work-item", name })),
      writeLineageRecord({ schemaVersion: 2, origin: { name: SlugSchema.parse(name) }, kind: "rename",
        successors: [{ name: SlugSchema.parse(successor) }], incoming: [] }));
  }
  const { context } = lifecycleSuccess(await createStoreReconcilePrepareContext(h.store, "dependent"));
  expect(await planDependencyReconcile({ ...context, dependentSlug: "dependent", edges: ["first"] })).toMatchObject({ status: "conflict",
    dependency: { after: ["first"], conflicts: [{ edge: "first", subject: "first", reason: "rename-cycle" }] } });
});
