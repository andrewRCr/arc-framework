/** Seeded dependency decisions survive provider retirement and reconciliation chains. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { readWorkUnit, recordPut, workUnitMetaPath } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn, writeMetaState, writeMetaCurrentWorkflow, writeMetaCompleted, writeMetaPrUrl } from "../../../../src/lib/store/kinds/meta/writers.js";
import { acquireDecomposeTerminal } from "../../../../src/lib/decompose/acquire-terminal.js";
import { checkDecomposeSeededFields } from "../../../../src/lib/decompose/check-seeded-fields.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import type { DecomposeContext } from "../../../../src/lib/decompose/context.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";
import type { WorkItemRef } from "../../../../src/lib/store/kinds/lineage/index.js";
import { buildStoreCurrentWuReconcile } from "../../../../src/lib/work-unit/store-current-wu-reconcile.js";

function target(record: StoreRecord): WorkItemRef {
  const owner = record.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected stored generation.");
  return { name: owner.name, uid: owner.uid };
}

async function check(ctx: DecomposeContext) {
  const acquired = await acquireDecomposeTerminal(ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  return checkDecomposeSeededFields(ctx, acquired.result);
}

it.each(["abandoned", "shipped", "Integrating"] as const)("accepts a reconciled removal of a seeded provider now %s", async outcome => {
  const h = await createDecomposeTerminalFixture({ provider: true });
  const provider = lifecycleSuccess(await readWorkUnit(h.store, "provider"));
  if (outcome === "abandoned") await h.seedRetiredWorkUnit(provider);
  else {
    const shipped = outcome === "shipped";
    let content = writeMetaCurrentWorkflow(writeMetaState(provider.content, shipped ? "Shipped" : "Integrating"), shipped ? null : "integrate-work-unit");
    if (shipped) content = writeMetaPrUrl(writeMetaCompleted(content, "2026-10-19"), "https://example.test/pull/1");
    lifecycleSuccess(await h.store.write({ ...recordPut(provider, { content, placement: shipped
      ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" } }),
      provenance: { verb: shipped ? "archive" : "publish", lifecycleAction: shipped ? "archive" : "publish" } }));
  }
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  await h.handEdit(member, writeMetaDependsOn(member.content, []));
  const before = lifecycleSuccess(await h.store.version());
  const result = await check(h.ctx);
  expect(result.status).toBe("ok");
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(result.result.observations.map(record => record.reference.owner.name)).toContain("provider");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("keeps an abandoned seeded provider's unchanged edge valid", async () => {
  const h = await createDecomposeTerminalFixture({ provider: true });
  const provider = lifecycleSuccess(await readWorkUnit(h.store, "provider"));
  await h.seedRetiredWorkUnit(provider);
  expect((await check(h.ctx)).status).toBe("ok");
});

it.each([1, 2])("accepts the member's replacement after %s successive provider cuts", async depth => {
  const h = await createDecomposeTerminalFixture({ provider: true, started: true });
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  const origin = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  const provider = lifecycleSuccess(await readWorkUnit(h.store, "provider"));
  const tail = await h.seedStub("tail");
  const middle = depth === 2 ? await h.seedStub("middle") : tail;
  const incoming = (replacement: StoreRecord) => [member, origin].map(record => ({ dependent: target(record),
    disposition: { kind: "replace" as const, replacementTargets: [target(replacement)] } }));
  const first = await h.seedRetiredWorkUnit(provider, { kind: "decompose", successors: [target(middle)], incoming: incoming(middle) });
  const second = depth === 2 ? await h.seedRetiredWorkUnit(middle, { kind: "decompose", successors: [target(tail)], incoming: incoming(tail) }) : null;
  await h.handEdit(member, writeMetaDependsOn(member.content, ["tail"]));
  const result = await check(h.ctx);
  expect(result.status).toBe("ok");
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(result.result.observations).toEqual(expect.arrayContaining([first, tail, ...(second === null ? [] : [second])]));
});

it("requires every replacement provider in the member's assigned retirement disposition", async () => {
  const h = await createDecomposeTerminalFixture({ provider: true, started: true });
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  const origin = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  const provider = lifecycleSuccess(await readWorkUnit(h.store, "provider"));
  const first = await h.seedStub("first"), second = await h.seedStub("second");
  await h.seedRetiredWorkUnit(provider, { kind: "decompose", successors: [target(first), target(second)],
    incoming: [member, origin].map(record => ({ dependent: target(record), disposition: { kind: "replace", replacementTargets: [target(first), target(second)] } })) });
  const partial = await h.handEdit(member, writeMetaDependsOn(member.content, ["first"]));
  expect(await check(h.ctx)).toMatchObject({ status: "refused", reason: "seed-divergence", locus: "member-b.Depends On" });
  await h.handEdit(partial, writeMetaDependsOn(partial.content, ["first", "second"]));
  expect((await check(h.ctx)).status).toBe("ok");
});

it("accepts another cut's explicit drop assigned to the member", async () => {
  const h = await createDecomposeTerminalFixture({ provider: true, started: true });
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  const origin = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  const provider = lifecycleSuccess(await readWorkUnit(h.store, "provider"));
  const tail = await h.seedStub("tail");
  await h.seedRetiredWorkUnit(provider, { kind: "decompose", successors: [target(tail)], incoming: [
    { dependent: target(member), disposition: { kind: "drop", reason: "This member no longer needs the retired provider." } },
    { dependent: target(origin), disposition: { kind: "replace", replacementTargets: [target(tail)] } },
  ] });
  await h.handEdit(member, writeMetaDependsOn(member.content, []));
  expect((await check(h.ctx)).status).toBe("ok");
});

it("accepts a started member's seeded edge after its own production reconcile drops it", async () => {
  const h = await createDecomposeTerminalFixture({ provider: true });
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  lifecycleSuccess(await h.store.write({ ...recordPut(member, { placement: { kind: "active" } }), provenance: { verb: "start", lifecycleAction: "start" } }));
  await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "provider")));
  const current = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  const reconcile = buildStoreCurrentWuReconcile(h.store);
  const prepared = await reconcile.prepare({ slug: "member-b", metaPath: workUnitMetaPath(current) });
  expect(prepared).toMatchObject({ status: "pending", prepared: { plan: { dependency: { after: [] } } } });
  expect(await reconcile.apply(prepared.prepared)).toMatchObject({ status: "applied" });
  expect(lifecycleSuccess(await readWorkUnit(h.store, "member-b"))).toMatchObject({ placement: { kind: "active" }, fields: { dependsOn: [] } });
  expect((await check(h.ctx)).status).toBe("ok");
});
