/** A rename settles its own target dependency only from a proven prior-provider disposition. */
import { expect, it } from "vitest";
import { createDecomposeHarness } from "../../../helpers/store/decompose-harness.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn, writeMetaNextAction } from "../../../../src/lib/store/kinds/meta/writers.js";
import { sameReference } from "../../../../src/lib/store/identity.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";

function identity(record: StoreRecord) {
  const owner = record.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected work-item UID");
  return { name: owner.name, uid: owner.uid };
}

async function retiredFixture(drop = false) {
  const h = createDecomposeHarness(), target = await h.seedStub("target");
  await h.seedStub("before"); await h.seedStub("after");
  const provider = await h.seedMeta("provider");
  const source = await h.seedMeta("source", { state: "Planning", currentWorkflow: null, dependsOn: ["before", "target", "after"] },
    { kind: "backlog", commitment: "planned" });
  const lineage = await h.seedRetiredWorkUnit(target, { kind: "decompose", successors: [identity(provider)],
    incoming: [{ dependent: identity(source), disposition: drop ? { kind: "drop", reason: "No remaining dependency." }
      : { kind: "replace", replacementTargets: [identity(provider)] } }] });
  const git = scriptGitExec([]), ctx = { store: h.store, cwd: "/repo", exec: git.exec, baseBranch: "main" };
  return { ...h, source, target, lineage, provider, git, ctx, request: { operand: identity(source).uid, targetSlug: "target" } };
}

it.each([false, true])("applies the subject's exact retired lineage disposition, drop=%s", async drop => {
  const h = await retiredFixture(drop);
  expect(await runStoreRename(h.ctx, h.request)).toMatchObject({ status: "renamed" });
  const result = lifecycleSuccess(await h.store.read({ reference: h.source.reference }));
  expect(result.reference.owner.name).toBe("target");
  expect(result.fields).toMatchObject({ dependsOn: drop ? ["before", "after"] : ["before", "provider", "after"] });
  for (const record of [h.lineage, h.provider]) expect(lifecycleSuccess(await h.store.read({ reference: record.reference }))).toEqual(record);
  expect(await h.store.read({ reference: h.target.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(h.git.calls).toEqual([]);
});

it("binds the subject's replacement provider without writing it, then retries after a change", async () => {
  const h = await retiredFixture(), batch = h.store.batch.bind(h.store); let once = true;
  h.store.batch = async input => {
    if (once) {
      once = false;
      await h.handEdit(h.provider, writeMetaNextAction(h.provider.content, "Concurrent provider update"));
    }
    return batch(input);
  };
  expect(await runStoreRename(h.ctx, h.request)).toMatchObject({ status: "rejected", refusal: { code: "version-conflict" } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.source.reference }))).toEqual(h.source);
  expect(lifecycleSuccess(await h.store.read({ reference: h.lineage.reference }))).toEqual(h.lineage);
  const provider = lifecycleSuccess(await h.store.read({ reference: h.provider.reference }));
  expect(provider.fields).toMatchObject({ nextAction: "Concurrent provider update" });
  expect(await runStoreRename(h.ctx, h.request)).toMatchObject({ status: "renamed" });
  expect(lifecycleSuccess(await h.store.read({ reference: h.source.reference })).fields).toMatchObject({ dependsOn: ["before", "provider", "after"] });
  expect(lifecycleSuccess(await h.store.read({ reference: h.provider.reference }))).toEqual(provider);
  expect(h.git.calls).toEqual([]);
});

it("rejects contradictory shared-provider observations and succeeds after fresh preparation", async () => {
  const h = createDecomposeHarness(), target = await h.seedCompletedWorkUnit("target");
  const source = await h.seedMeta("source", { state: "Planning", currentWorkflow: null, dependsOn: ["target"] },
    { kind: "backlog", commitment: "planned" });
  const waiting = await h.seedMeta("waiting", { state: "Planning", currentWorkflow: null, dependsOn: ["target"] },
    { kind: "backlog", commitment: "planned" });
  const read = h.store.read.bind(h.store); let targetReads = 0;
  h.store.read = async input => {
    const result = await read(input);
    if (sameReference(input.reference, target.reference) && ++targetReads === 2) {
      lifecycleSuccess(await h.store.write({ ...recordPut(target, { content: `${target.content}\nNew completion evidence.\n` }),
        provenance: { verb: "write-back", lifecycleAction: "edit" } }));
    }
    return result;
  };
  const git = scriptGitExec([]), ctx = { store: h.store, cwd: "/repo", exec: git.exec, baseBranch: "main" };
  const owner = source.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected work-item UID");
  const request = { operand: owner.uid.toUpperCase(), targetSlug: "target" };
  const result = await runStoreRename(ctx, request);
  expect(result, JSON.stringify(result)).toMatchObject({ status: "rejected", refusal: { code: "version-conflict",
    remedy: { argv: ["arc", "rename", request.operand, "target"] } } });
  for (const record of [source, waiting]) expect(lifecycleSuccess(await read({ reference: record.reference }))).toEqual(record);
  const changedTarget = lifecycleSuccess(await read({ reference: target.reference }));
  expect(changedTarget.content).toContain("New completion evidence.");
  expect(await runStoreRename(ctx, request)).toMatchObject({ status: "renamed" });
  for (const record of [source, waiting]) expect(lifecycleSuccess(await read({ reference: record.reference })).fields).toMatchObject({ dependsOn: [] });
  expect(lifecycleSuccess(await read({ reference: target.reference }))).toEqual(changedTarget);
  expect(git.calls).toEqual([]);
});

it("holds an unproven own target edge until it is explicitly repaired", async () => {
  const h = createDecomposeHarness(), target = await h.seedStub("target");
  const source = await h.seedMeta("source", { state: "Planning", currentWorkflow: null, dependsOn: ["target"] },
    { kind: "backlog", commitment: "planned" });
  lifecycleSuccess(await h.store.write({ action: "remove", reference: target.reference, expected: target.version,
    provenance: { verb: "remove", lifecycleAction: "remove" } }));
  const git = scriptGitExec([]), ctx = { store: h.store, cwd: "/repo", exec: git.exec, baseBranch: "main" };
  const request = { operand: "source", targetSlug: "target" }, before = lifecycleSuccess(await h.store.version());
  expect(await runStoreRename(ctx, request)).toMatchObject({ status: "rejected", refusal: { rule: "lifecycle.rename",
    condition: expect.stringContaining("target"), remedy: { text: expect.stringContaining("Depends On"),
      argv: ["arc", "rename", "source", "target"] } } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: source.reference }))).toEqual(source);
  lifecycleSuccess(await h.store.write({ ...recordPut(source, { content: writeMetaDependsOn(source.content, []) }),
    provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  expect(await runStoreRename(ctx, request)).toMatchObject({ status: "renamed" });
  expect(lifecycleSuccess(await h.store.read({ reference: source.reference })).fields).toMatchObject({ dependsOn: [] });
  expect(git.calls).toEqual([]);
});
