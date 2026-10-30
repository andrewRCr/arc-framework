/** A settlement recipient must remain outside a cut through atomic publication. */
import { expect, it } from "vitest";
import { createDecomposePlanFixture } from "../../../fixtures/decompose-plan.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { withCompetingBatch } from "../../../helpers/store/decompose-harness.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { runStoreDecomposeDiscard } from "../../../../src/lib/decompose/discard.js";
import { prepareDecomposeRevision } from "../../../../src/lib/decompose/revision-plan.js";
import { decomposeApplyAuthority } from "../../../../src/lib/decompose/apply-authority.js";
import { readLifecycleMetaFields } from "../../../../src/lib/store/lifecycle-write.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { writeMetaDependsOn } from "../../../../src/lib/store/kinds/meta/writers.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";

function success<T>(input: { status: "ok"; result: T } | { status: "refused" }): T {
  if (input.status === "refused") throw new Error(JSON.stringify(input));
  return input.result;
}

function reuseMember(map: CutMap) {
  const member = map.authoring.destinations[1];
  if (member?.kind !== "new-member") throw new Error("Expected member.");
  member.slug = "reused";
  map.authoring.internalEdges = [{ from: "member-a", to: "reused" }];
  for (const edge of map.authoring.outgoingDispositions) edge.disposition = { kind: "targets", targets: ["reused"] };
}

async function fixture(mode: "additive" | "revision", parked = false) {
  const h = await createDecomposePlanFixture();
  const map = completeCutMapFixture(success(await prepareDecomposePreflight(h.ctx, "origin")).machine);
  if (mode === "revision") success(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: map, cutMapPath: "cut.json" }));
  const prior = await h.seedStub("reused");
  const consumer = await h.seedMeta("consumer", { state: parked ? "Active" : "Planning",
    currentWorkflow: parked ? "process-task-loop" : null, dependsOn: ["reused"], design: ["draft-consumer.md"] },
    { kind: "backlog", commitment: "planned" });
  await h.seed(recordReferences["work-item/draft"](consumer.reference.owner), "# Consumer\n\n## Scope\n\nWork.\n");
  await h.seedRetiredWorkUnit(prior);
  reuseMember(map);
  const compete = async () => {
    const own = completeCutMapFixture(success(await prepareDecomposePreflight(h.ctx, "consumer")).machine);
    for (const member of own.authoring.destinations) if (member.kind === "new-member") member.slug = `own-${member.slug}`;
    for (const allocation of own.authoring.sourceAllocations) if (allocation.disposition.kind === "target")
      allocation.disposition.targetLocator.artifact = "draft-own-member-a.md";
    own.authoring.internalEdges = [{ from: "own-member-a", to: "own-member-b" }];
    for (const edge of own.authoring.outgoingDispositions) edge.disposition = { kind: "drop", reason: "No inherited edge." };
    own.authoring.placement = { kind: "cohort", cohort: "own-group", purpose: "Coordinate the recipient's cut." };
    success(await runStoreDecomposeAdditive(h.ctx, "consumer", "execute", { cutMap: own, cutMapPath: "own.json" }));
  };
  return { ...h, map, consumer, compete, input: { cutMap: map, cutMapPath: "cut.json" } };
}

it.each(["additive", "revision"] as const)("preserves a parked dependent through %s reuse until its owner repairs the edge", async mode => {
  const h = await fixture(mode, true);
  const apply = async () => {
    if (mode === "additive") return runStoreDecomposeAdditive(h.ctx, "origin", "execute", h.input);
    const preview = success(await runStoreDecomposeRevision(h.ctx, "origin", h.input));
    if (preview.kind !== "preview") throw new Error("Expected revision preview.");
    return runStoreDecomposeRevision(h.ctx, "origin", h.input, { applyAuthority: preview.applyAuthority });
  };
  const before = structuredClone([...h.store.state.records.entries()]);
  expect(await apply()).toMatchObject({ status: "refused", reason: "store", storeRefusal: { rule: "work-item.slug-edges" } });
  expect([...h.store.state.records.entries()]).toEqual(before);
  expect(success(await h.store.read({ reference: h.consumer.reference }))).toEqual(h.consumer);
  await h.handEdit(h.consumer, writeMetaDependsOn(h.consumer.content, []));
  expect(await apply()).toMatchObject({ status: "ok" });
  expect(success(readLifecycleMetaFields(success(await h.store.read({ reference: h.consumer.reference }))))).toMatchObject({
    state: "Active", dependsOn: [],
  });
});

it.each(["additive", "revision"] as const)("refuses a competing recipient cut at the %s batch boundary, then retries after discard", async mode => {
  const h = await fixture(mode);
  const preview = mode === "revision" ? success(await runStoreDecomposeRevision(h.ctx, "origin", h.input)) : undefined;
  if (preview !== undefined && preview.kind !== "preview") throw new Error("Expected preview.");
  let competingState: unknown;
  const store = withCompetingBatch(h.store, async () => {
    await h.compete();
    competingState = structuredClone([...h.store.state.records.entries()]);
  });
  const ctx = { ...h.ctx, executor: { ...h.ctx.executor, store } };
  const result = mode === "additive" ? await runStoreDecomposeAdditive(ctx, "origin", "execute", h.input)
    : await runStoreDecomposeRevision(ctx, "origin", h.input, { applyAuthority: preview?.kind === "preview" ? preview.applyAuthority : undefined });
  expect(result).toMatchObject({ status: "refused", class: "recoverable" });
  expect([...h.store.state.records.entries()]).toEqual(competingState);
  const consumer = success(await h.store.read({ reference: h.consumer.reference }));
  expect(success(readLifecycleMetaFields(consumer)).dependsOn).toEqual(["reused"]);
  const discard = success(await runStoreDecomposeDiscard(h.ctx, "consumer"));
  if (discard.kind !== "preview") throw new Error("Expected discard preview.");
  success(await runStoreDecomposeDiscard(h.ctx, "consumer", { applyAuthority: discard.applyAuthority }));
  if (mode === "additive") success(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", h.input));
  else {
    const fresh = success(await runStoreDecomposeRevision(h.ctx, "origin", h.input));
    if (fresh.kind !== "preview") throw new Error("Expected revision preview.");
    success(await runStoreDecomposeRevision(h.ctx, "origin", h.input, { applyAuthority: fresh.applyAuthority }));
  }
  expect(success(readLifecycleMetaFields(success(await h.store.read({ reference: consumer.reference })))).dependsOn).toEqual([]);
});

it("requires revision approval to include the recipient's absent cut map", async () => {
  const h = await fixture("revision");
  const plan = success(await prepareDecomposeRevision(h.ctx, "origin", h.input));
  const incompleteAuthority = decomposeApplyAuthority({ mode: "revise", origin: plan.map.machine.origin,
    records: plan.records, writes: plan.writes });
  const preview = success(await runStoreDecomposeRevision(h.ctx, "origin", h.input));
  if (preview.kind !== "preview") throw new Error("Expected preview.");
  expect(preview.applyAuthority).not.toBe(incompleteAuthority);
  const before = success(await h.store.version());
  expect(await runStoreDecomposeRevision(h.ctx, "origin", h.input, { applyAuthority: incompleteAuthority }))
    .toMatchObject({ status: "refused", reason: "stale-apply-authority" });
  expect(success(await h.store.version())).toBe(before);
  expect(await runStoreDecomposeRevision(h.ctx, "origin", h.input, { applyAuthority: preview.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
});
