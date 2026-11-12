/** Reused rename targets settle only owned stub decisions under captured read evidence. */
import { expect, it } from "vitest";
import { createDecomposeHarness } from "../../../helpers/store/decompose-harness.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn, writeMetaNextAction } from "../../../../src/lib/store/kinds/meta/writers.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";
import { OwnerIdentitySchema, recordReferences, sameOwner } from "../../../../src/lib/store/identity.js";

function identity(record: StoreRecord) {
  const owner = record.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected work-item UID");
  return { name: owner.name, uid: owner.uid };
}

async function archivedFixture(kind: "both" | "in-flight" | "parked") {
  const h = createDecomposeHarness(), target = await h.seedCompletedWorkUnit("target"), source = await h.seedStub("source");
  const waiting = await h.seedMeta("waiting", { state: kind === "both" ? "Planning" : "Active",
    currentWorkflow: kind === "both" ? null : "process-task-loop", dependsOn: kind === "both" ? ["source", "target"] : ["target"] },
  kind === "in-flight" ? { kind: "active" } : { kind: "backlog", commitment: "planned" });
  const git = scriptGitExec([]), ctx = { store: h.store, cwd: "/repo", exec: git.exec, baseBranch: "main" };
  return { ...h, source, target, waiting, git, ctx, rename: () => runStoreRename(ctx, { operand: "source", targetSlug: "target" }) };
}

it.each(["in-flight", "parked"] as const)("leaves the %s dependent's target edge to its owner, then retries after repair", async kind => {
  const h = await archivedFixture(kind), before = lifecycleSuccess(await h.store.version());
  expect(await h.rename()).toMatchObject({ status: "rejected", refusal: { rule: "work-item.slug-edges",
    remedy: { text: expect.stringContaining("arc wu reconcile --apply") } } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  for (const record of [h.source, h.target, h.waiting]) expect(lifecycleSuccess(await h.store.read({ reference: record.reference }))).toEqual(record);
  lifecycleSuccess(await h.store.write({ ...recordPut(h.waiting, { content: writeMetaDependsOn(h.waiting.content, []) }),
    provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  expect(await h.rename()).toMatchObject({ status: "renamed" });
  expect(lifecycleSuccess(await h.store.read({ reference: h.waiting.reference })).fields).toMatchObject({ dependsOn: [] });
  expect(lifecycleSuccess(await h.store.read({ reference: h.target.reference }))).toEqual(h.target); expect(h.git.calls).toEqual([]);
});

it("holds a stub naming source and target until its target edge is separately settled", async () => {
  const h = await archivedFixture("both"), before = lifecycleSuccess(await h.store.version());
  expect(await h.rename()).toMatchObject({ status: "rejected", refusal: { rule: "work-item.slug-edges",
    remedy: { text: expect.stringContaining("Anyone may edit a stub's edge") } } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: h.waiting.reference }))).toEqual(h.waiting);
  lifecycleSuccess(await h.store.write({ ...recordPut(h.waiting, { content: writeMetaDependsOn(h.waiting.content, ["source"]) }),
    provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  expect(await h.rename()).toMatchObject({ status: "renamed" });
  expect(lifecycleSuccess(await h.store.read({ reference: h.waiting.reference })).fields).toMatchObject({ dependsOn: ["target"] });
  expect(lifecycleSuccess(await h.store.read({ reference: h.target.reference }))).toEqual(h.target); expect(h.git.calls).toEqual([]);
});

async function retiredFixture() {
  const h = createDecomposeHarness(), target = await h.seedStub("target"), source = await h.seedStub("source");
  await h.seedStub("before"); await h.seedStub("after");
  const first = await h.seedMeta("leaf-a"), second = await h.seedMeta("leaf-b");
  const waiting = await h.seedMeta("waiting", { state: "Planning", currentWorkflow: null, dependsOn: ["before", "target", "after"] },
    { kind: "backlog", commitment: "planned" });
  const lineage = await h.seedRetiredWorkUnit(target, { kind: "decompose", successors: [identity(first), identity(second)],
    incoming: [{ dependent: identity(waiting), disposition: { kind: "replace", replacementTargets: [identity(first)] } }] });
  const git = scriptGitExec([]), ctx = { store: h.store, cwd: "/repo", exec: git.exec, baseBranch: "main" };
  return { ...h, target, source, waiting, lineage, first, second, git, ctx,
    rename: () => runStoreRename(ctx, { operand: "source", targetSlug: "target" }) };
}

it("takes a retired origin's lineage disposition in the same rename batch", async () => {
  const h = await retiredFixture();
  expect(await h.rename()).toMatchObject({ status: "renamed" });
  expect(lifecycleSuccess(await h.store.read({ reference: h.waiting.reference })).fields).toMatchObject({ dependsOn: ["before", "leaf-a", "after"] });
  expect(lifecycleSuccess(await h.store.read({ reference: h.lineage.reference }))).toEqual(h.lineage);
  expect(await h.store.read({ reference: h.target.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});

it("binds retired-provider evidence and re-plans after it changes before the batch", async () => {
  const h = await retiredFixture(), batch = h.store.batch.bind(h.store); let once = true;
  h.store.batch = async input => {
    if (once) {
      once = false;
      const fresh = lifecycleSuccess(await h.store.read({ reference: h.first.reference }));
      lifecycleSuccess(await h.store.write({ ...recordPut(fresh, { content: writeMetaNextAction(fresh.content, "Concurrent evidence") }),
        provenance: { verb: "write-back", lifecycleAction: "edit" } }));
    }
    return batch(input);
  };
  const result = await h.rename();
  expect(result, JSON.stringify(result)).toMatchObject({ status: "rejected", refusal: { code: "version-conflict" } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.source.reference }))).toEqual(h.source);
  expect(lifecycleSuccess(await h.store.read({ reference: h.waiting.reference }))).toEqual(h.waiting);
  expect(await h.rename()).toMatchObject({ status: "renamed" });
  expect(lifecycleSuccess(await h.store.read({ reference: h.waiting.reference })).fields).toMatchObject({ dependsOn: ["before", "leaf-a", "after"] });
  expect(lifecycleSuccess(await h.store.read({ reference: h.first.reference })).fields).toMatchObject({ nextAction: "Concurrent evidence" });
  expect(h.git.calls).toEqual([]);
});

it("re-acquires a newly observed stub before applying any of its settlement writes", async () => {
  const h = createDecomposeHarness(), target = await h.seedCompletedWorkUnit("target"), source = await h.seedStub("source");
  const list = h.store.list.bind(h.store); let ownGroup = false, inserted = false;
  h.store.list = async input => {
    const result = await list(input);
    if (input.family === "work-item" && input.owner !== undefined && sameOwner(input.owner, source.reference.owner)) ownGroup = true;
    else if (ownGroup && !inserted && input.family === "work-item" && input.kind === "work-item/meta" && input.owner === undefined) {
      inserted = true;
      await h.seedMeta("waiting", { state: "Planning", currentWorkflow: null, dependsOn: ["source", "target"] },
        { kind: "backlog", commitment: "planned" });
    }
    return result;
  };
  const git = scriptGitExec([]), ctx = { store: h.store, cwd: "/repo", exec: git.exec, baseBranch: "main" };
  const operand = identity(source).uid.toUpperCase(), request = { operand, targetSlug: "target" };
  expect(await runStoreRename(ctx, request)).toMatchObject({ status: "rejected", refusal: { code: "version-conflict",
    remedy: { argv: ["arc", "rename", operand, "target"] } } });
  expect(inserted).toBe(true);
  const waiting = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/meta"](
    OwnerIdentitySchema.parse({ type: "work-item", name: "waiting" })) }));
  expect(waiting.fields).toMatchObject({ dependsOn: ["source", "target"] });
  expect(lifecycleSuccess(await h.store.read({ reference: source.reference }))).toEqual(source);
  expect(lifecycleSuccess(await h.store.read({ reference: target.reference }))).toEqual(target);
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreRename(ctx, request)).toMatchObject({ status: "rejected", refusal: { rule: "work-item.slug-edges" } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  lifecycleSuccess(await h.store.write({ ...recordPut(waiting, { content: writeMetaDependsOn(waiting.content, ["source"]) }),
    provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  expect(await runStoreRename(ctx, request)).toMatchObject({ status: "renamed" });
  expect(lifecycleSuccess(await h.store.read({ reference: waiting.reference })).fields).toMatchObject({ dependsOn: ["target"] });
  expect(git.calls).toEqual([]);
});
