/** Decomposition lineage keeps exact branch authority and current generation references. */
import { expect, it } from "vitest";
import { observedDecomposeBatch } from "../../../helpers/store/decompose-batch.js";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { readWorkUnit, recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { acquireDecomposeTerminal } from "../../../../src/lib/decompose/acquire-terminal.js";
import { prepareDecomposeLineage } from "../../../../src/lib/decompose/lineage-plan.js";
import { readStoreRetirementEvidence } from "../../../../src/lib/work-unit/store-retirement-evidence.js";
import type { BranchLink } from "../../../../src/lib/store/links.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { checkDecomposeSourceBinding } from "../../../../src/lib/decompose/source-binding.js";

it.each([false, true])("persists exact retired branches and supplies executable teardown evidence, linked=%s", async linked => {
  const h = await createDecomposeTerminalFixture();
  const branches: BranchLink[] = linked ? [
    { repository: "repo", ref: "plan/origin", linkedAs: "created", excluded: [{ repository: "repo", sha: "1".repeat(40) }] },
    { repository: "repo", ref: "kept-work", linkedAs: "adopted", excluded: [] },
  ] : [];
  if (linked) {
    const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
    lifecycleSuccess(await h.store.write({ ...recordPut(primary, { links: { branches } }),
      provenance: { verb: "link", lifecycleAction: "link" } }));
  }
  const input = await acquireDecomposeTerminal(h.ctx, "origin");
  if (input.status === "refused") throw new Error(JSON.stringify(input));
  const prepared = await prepareDecomposeLineage(h.ctx, input.result);
  if (prepared.status === "refused") throw new Error(JSON.stringify(prepared));
  expect(prepared.result.lineage.retiredBranches).toEqual(branches);
  const { primary, storedMap } = input.result.acquired;
  lifecycleSuccess(await observedDecomposeBatch(h.store, { provenance: { verb: "decompose", lifecycleAction: "terminal" }, writes: [
    prepared.result.write, { action: "remove", reference: primary.reference, expected: primary.version },
    { action: "remove", reference: storedMap.reference, expected: storedMap.version },
  ] }));
  const evidence = await readStoreRetirementEvidence(h.store, "origin", "0".repeat(40));
  expect(evidence.rule).toBe("landed");
  expect(evidence.branches).toEqual(branches);
  expect(evidence.record.reference).toEqual(prepared.result.write.reference);
  await expect(evidence.revalidate()).resolves.toBeUndefined();
});

it("keeps the current name and generation of a renamed provider that retired between batches", async () => {
  const h = await createDecomposeTerminalFixture({ provider: true, authorMap: map => {
    for (const outgoing of map.authoring.outgoingDispositions) outgoing.disposition = { kind: "drop", reason: "No inherited provider edge." };
  } });
  expect(await runStoreRename({ ...h.ctx.executor, baseBranch: h.ctx.baseBranch }, { sourceSlug: "provider", targetSlug: "foundation" }))
    .toMatchObject({ status: "renamed" });
  const provider = lifecycleSuccess(await readWorkUnit(h.store, "foundation"));
  const retired = await h.seedRetiredWorkUnit(provider);
  const input = await acquireDecomposeTerminal(h.ctx, "origin");
  if (input.status === "refused") throw new Error(JSON.stringify(input));
  expect(checkDecomposeSourceBinding(h.ctx, input.result)).toMatchObject({ status: "ok" });
  const planned = await prepareDecomposeLineage(h.ctx, input.result);
  if (planned.status === "refused") throw new Error(JSON.stringify(planned));
  expect(planned.result.lineage.outgoing).toEqual([{ prerequisite: { name: "foundation",
    uid: provider.reference.owner.type === "work-item" ? provider.reference.owner.uid : undefined }, members: [] }]);
  expect(planned.result.observations).toEqual([retired]);
});

it("projects current member, home, provider, and renamed dependent generations into lineage", async () => {
  const h = await createDecomposeTerminalFixture({ provider: true, withHome: true, authorMap: map => {
    for (const incoming of map.authoring.incomingDispositions) {
      const dependent = map.machine.incomingEdges.find(edge => edge.edgeId === incoming.edgeId)?.dependent.slug;
      incoming.disposition = { kind: "replace", replacementTargets: dependent === "home" ? ["member-a"] : ["home", "member-a"] };
    }
  } });
  for (const [sourceSlug, targetSlug] of [["consumer", "client"], ["provider", "foundation"], ["home", "existing-work"]] as const) {
    expect(await runStoreRename({ ...h.ctx.executor, baseBranch: h.ctx.baseBranch }, { sourceSlug, targetSlug }))
      .toMatchObject({ status: "renamed" });
  }
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  const client = lifecycleSuccess(await readWorkUnit(h.store, "client"));
  const provider = lifecycleSuccess(await readWorkUnit(h.store, "foundation"));
  const home = lifecycleSuccess(await readWorkUnit(h.store, "existing-work"));
  const memberA = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const memberB = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  const ref = (record: typeof primary) => ({ name: record.reference.owner.name,
    uid: record.reference.owner.type === "work-item" ? record.reference.owner.uid : undefined });
  const input = await acquireDecomposeTerminal(h.ctx, "origin");
  if (input.status === "refused") throw new Error(JSON.stringify(input));
  const planned = await prepareDecomposeLineage(h.ctx, input.result);
  if (planned.status === "refused") throw new Error(JSON.stringify(planned));
  expect(planned.result.lineage).toMatchObject({ origin: ref(primary), successors: [ref(memberA), ref(memberB)],
    incoming: [
      { dependent: ref(client), disposition: { kind: "replace", replacementTargets: [ref(home), ref(memberA)] } },
      { dependent: ref(home), disposition: { kind: "replace", replacementTargets: [ref(memberA)] } },
    ], outgoing: [{ prerequisite: ref(provider), members: [ref(memberB)] }] });
  expect(JSON.parse(planned.result.write.content)).toEqual(planned.result.lineage);
});
