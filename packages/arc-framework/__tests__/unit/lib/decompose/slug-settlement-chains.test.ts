/** Stub settlement follows complete prior-generation lineage rather than new member names. */
import { expect, it } from "vitest";
import { createDecomposePlanFixture } from "../../../fixtures/decompose-plan.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { planDecomposeSlugSettlements } from "../../../../src/lib/decompose/slug-settlement.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";
import type { WorkItemRef } from "../../../../src/lib/store/kinds/lineage/index.js";

function identity(record: StoreRecord): WorkItemRef {
  const owner = record.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected a generation.");
  return { name: owner.name, uid: owner.uid };
}

async function scenario() {
  const h = await createDecomposePlanFixture();
  const prior = await h.seedStub("reused");
  const middle = await h.seedStub("middle");
  const leaf = await h.seedStub("leaf");
  const dependent = await h.seedMeta("consumer", { state: "Planning", currentWorkflow: null, dependsOn: ["reused"] },
    { kind: "backlog", commitment: "planned" });
  const member = h.map.authoring.destinations[1];
  if (member?.kind !== "new-member") throw new Error("Expected member.");
  member.slug = "reused";
  const retire = (record: StoreRecord, targets: StoreRecord[], mapped = true) => h.seedRetiredWorkUnit(record, {
    kind: "decompose", successors: targets.map(identity), incoming: mapped ? [{ dependent: identity(dependent),
      disposition: { kind: "replace", replacementTargets: targets.map(identity) } }] : [],
  });
  const plan = async () => {
    const fresh = await prepareDecomposePreflight(h.ctx, "origin");
    if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
    return planDecomposeSlugSettlements(h.ctx, h.map, fresh.result.acquired);
  };
  return { ...h, prior, middle, leaf, dependent, retire, planSettlement: plan };
}

it("follows retired replacements recursively and retains all record versions", async () => {
  const h = await scenario();
  const first = await h.retire(h.prior, [h.middle]);
  const second = await h.retire(h.middle, [h.leaf]);
  const result = await h.planSettlement();
  expect(result).toMatchObject({ status: "ok", result: { settlements: [{ disposition: {
    kind: "replace", replacementTargets: ["leaf"],
  } }] } });
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(result.result.records).toEqual(expect.arrayContaining([h.dependent, first, second, h.leaf]));
});

it("leaves an unmapped tail out and admits the dependent owner's edge repair", async () => {
  const h = await scenario();
  await h.retire(h.prior, [h.middle]);
  await h.retire(h.middle, [h.leaf], false);
  expect(await h.planSettlement()).toMatchObject({ status: "ok", result: { settlements: [] } });
  const { writeMetaDependsOn } = await import("../../../../src/lib/store/kinds/meta/writers.js");
  await h.handEdit(h.dependent, writeMetaDependsOn(h.dependent.content, ["leaf"]));
  expect(await h.planSettlement()).toMatchObject({ status: "ok", result: { settlements: [] } });
});

it("discharges a completed replacement instead of keeping a new edge on it", async () => {
  const h = await scenario();
  const completed = await h.seedCompletedWorkUnit("done");
  await h.retire(h.prior, [completed]);
  expect(await h.planSettlement()).toMatchObject({ status: "ok", result: { settlements: [{ disposition: { kind: "drop" } }] } });
});

it("resolves a provider's former name after retirement through authenticated history", async () => {
  const h = await scenario();
  const renamed = await h.seedRenamedWorkUnit("old-provider", "current-provider");
  const { writeMetaDependsOn } = await import("../../../../src/lib/store/kinds/meta/writers.js");
  const { lifecycleSuccess } = await import("../../../helpers/store/lifecycle-harness.js");
  const dependent = lifecycleSuccess(await h.store.read({ reference: h.dependent.reference }));
  await h.handEdit(dependent, writeMetaDependsOn(dependent.content, ["old-provider"]));
  await h.seedRetiredWorkUnit(renamed);
  const member = h.map.authoring.destinations[1];
  if (member?.kind !== "new-member") throw new Error("Expected member.");
  member.slug = "old-provider";
  expect(await h.planSettlement()).toMatchObject({ status: "ok", result: { settlements: [{ edge: "old-provider",
    priorTarget: identity(renamed), disposition: { kind: "drop" } }] } });
});

it.each(["cycle", "self", "unmapped"] as const)("leaves a %s replacement unresolved", async kind => {
  const h = await scenario();
  await h.retire(h.prior, [h.middle]);
  await h.retire(h.middle, [kind === "cycle" ? h.prior : kind === "self" ? h.dependent : h.leaf], kind !== "unmapped");
  expect(await h.planSettlement()).toMatchObject({ status: "ok", result: { settlements: [] } });
});

it("discharges an Integrating replacement and matches a renamed dependent by generation", async () => {
  const h = await scenario();
  const closing = await h.seedMeta("closing", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  await h.retire(h.prior, [closing]);
  const { runStoreRename } = await import("../../../../src/lib/work-unit/verbs/rename-store.js");
  const { scriptGitExec } = await import("../../../helpers/git-exec-fake.js");
  expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: scriptGitExec([]).exec, baseBranch: "main" },
    { sourceSlug: "consumer", targetSlug: "renamed-consumer" })).toMatchObject({ status: "renamed" });
  expect(await h.planSettlement()).toMatchObject({ status: "ok", result: { settlements: [{ primary: {
    reference: { owner: { name: "renamed-consumer", uid: identity(h.dependent).uid } },
  }, disposition: { kind: "drop" } }] } });
});

it("matches a legacy dependent name through its unique current alias", async () => {
  const h = await scenario();
  await h.seedRetiredWorkUnit(h.prior, { kind: "decompose", successors: [identity(h.leaf)], incoming: [{
    dependent: { name: identity(h.dependent).name }, disposition: { kind: "replace", replacementTargets: [identity(h.leaf)] },
  }] });
  const { runStoreRename } = await import("../../../../src/lib/work-unit/verbs/rename-store.js");
  const { scriptGitExec } = await import("../../../helpers/git-exec-fake.js");
  expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: scriptGitExec([]).exec, baseBranch: "main" },
    { sourceSlug: "consumer", targetSlug: "renamed-consumer" })).toMatchObject({ status: "renamed" });
  expect(await h.planSettlement()).toMatchObject({ status: "ok", result: { settlements: [{ disposition: {
    kind: "replace", replacementTargets: ["leaf"],
  } }] } });
});
