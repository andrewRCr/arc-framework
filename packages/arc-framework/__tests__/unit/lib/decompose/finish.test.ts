/** Finish previews bind exact record versions and mutations across distribution approval. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { createDefaultLocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
import { readWorkUnit } from "../../../../src/lib/store/lifecycle-write.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { writeMetaNextAction, writeMetaPriority } from "../../../../src/lib/store/kinds/meta/writers.js";
import { withCompetingBatch } from "../../../helpers/store/decompose-harness.js";
import { createDecomposeRetirementFixture } from "../../../fixtures/decompose-retirement.js";
import { prepareDecomposeRetirement } from "../../../../src/lib/decompose/retirement-plan.js";
import { decomposeApplyAuthority } from "../../../../src/lib/decompose/apply-authority.js";
import { sortByCanonicalBytes } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { runStoreDecomposeFinish } from "../../../../src/lib/decompose/finish.js";

it("previews lineage and every removal and write without changing store state", async () => {
  const h = await createDecomposeTerminalFixture();
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null };
  const before = lifecycleSuccess(await h.store.version());
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  expect(preview).toMatchObject({ status: "ok", result: { kind: "preview", mode: "retirement-finish",
    origin: { slug: "origin" }, applyAuthority: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    lineage: { kind: "decompose", retiredBranches: [] },
    removals: expect.arrayContaining([expect.objectContaining({ kind: "work-item/meta" }), expect.objectContaining({ kind: "work-item/cut-map" })]),
    writes: expect.arrayContaining([expect.objectContaining({ action: "put", reference: expect.objectContaining({ kind: "lineage/transition" }) }),
      expect.objectContaining({ action: "put", reference: expect.objectContaining({ kind: "work-item/meta", owner: expect.objectContaining({ name: "consumer" }) }) })]) } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("applies a matching authority with exactly the previewed mutations", async () => {
  const h = await createDecomposeTerminalFixture();
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null };
  const result = await runStoreDecomposeFinish(h.ctx, "origin");
  if (result.status === "refused" || result.result.kind !== "preview") throw Error(JSON.stringify(result));
  const preview = result.result;
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "applied", origin: { slug: "origin" },
      members: [{ name: "member-a" }, { name: "member-b" }], notices: [] } });
  const changes = lifecycleSuccess(await h.store.changes({ from: before, to: lifecycleSuccess(await h.store.version()) }));
  expect(sortByCanonicalBytes(changes.map(change => ({ reference: change.reference, content: change.content }))))
    .toEqual(sortByCanonicalBytes(preview.writes.map(write => ({ reference: write.reference, content: write.action === "put" ? write.content : null }))));
});

it.each(["member", "dependent"] as const)("requires fresh approval after accepted %s grooming", async recipient => {
  const h = await createDecomposeTerminalFixture();
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null };
  const result = await runStoreDecomposeFinish(h.ctx, "origin");
  if (result.status === "refused" || result.result.kind !== "preview") throw Error(JSON.stringify(result));
  const record = lifecycleSuccess(await readWorkUnit(h.store, recipient === "member" ? "member-a" : "consumer"));
  await h.handEdit(record, recipient === "member" ? writeMetaNextAction(record.content, "Clarify the destination.")
    : writeMetaPriority(record.content, "P2"));
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: result.result.applyAuthority })).toMatchObject({
    status: "refused", reason: "stale-apply-authority", remedy: { argv: ["arc", "decompose", "origin", "--finish"] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const fresh = await runStoreDecomposeFinish(h.ctx, "origin");
  if (fresh.status === "refused" || fresh.result.kind !== "preview") throw Error(JSON.stringify(fresh));
  expect(fresh.result.applyAuthority).not.toBe(result.result.applyAuthority);
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: fresh.result.applyAuthority })).toMatchObject({ status: "ok", result: { kind: "applied" } });
});

it("reports a current content refusal before checking an old authority", async () => {
  const h = await createDecomposeTerminalFixture();
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null };
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const draft = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/draft"](member.reference.owner) }));
  await h.handEdit(draft, draft.content.replace("## Scope", "## Different"));
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: "stale" })).toMatchObject({ status: "refused", reason: "locator-unresolved" });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("refuses a batch conflict without persistence and requires a fresh preview and approval", async () => {
  const h = await createDecomposeTerminalFixture();
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null };
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw Error(JSON.stringify(preview));
  const consumer = lifecycleSuccess(await readWorkUnit(h.store, "consumer"));
  h.ctx.executor.store = withCompetingBatch(h.store, async () => { await h.handEdit(consumer, writeMetaPriority(consumer.content, "P2")); });
  const before = lifecycleSuccess(await h.store.version());
  const refused = await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority });
  expect(refused).toMatchObject({ status: "refused", reason: "version-conflict", remedy: {
    argv: ["arc", "decompose", "origin", "--finish"], text: expect.stringMatching(/fresh.*preview.*approv/iu) } });
  expect((await readWorkUnit(h.store, "origin")).status).toBe("ok");
  const changes = lifecycleSuccess(await h.store.changes({ from: before, to: lifecycleSuccess(await h.store.version()) }));
  expect(changes).toHaveLength(1);
  expect(changes[0]?.reference).toEqual(consumer.reference);
  const fresh = await runStoreDecomposeFinish(h.ctx, "origin");
  if (fresh.status === "refused" || fresh.result.kind !== "preview") throw Error(JSON.stringify(fresh));
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: fresh.result.applyAuthority })).toMatchObject({ status: "ok", result: { kind: "applied" } });
});

it.each([true, false])("checks a dirty holder at preview and preserves projection repairs, spawned=%s", async spawned => {
  const h = await createDecomposeRetirementFixture({ held: true, dirty: true, spawned });
  const before = lifecycleSuccess(await h.store.version());
  if (spawned) {
    expect(await runStoreDecomposeFinish(h.ctx, "demo")).toMatchObject({ status: "refused", reason: "removal-check" });
  } else {
    expect(await runStoreDecomposeFinish(h.ctx, "demo")).toMatchObject({ status: "ok", result: { kind: "preview" } });
    const remedy = { text: "Repair this projected record before releasing the checkout.", argv: ["arc", "save"] };
    h.ctx.removal!.check = async () => ({ kind: "would-refuse", remedy });
    expect(await runStoreDecomposeFinish(h.ctx, "demo")).toMatchObject({ status: "refused", reason: "removal-check", remedy });
    h.ctx.removal!.check = async () => ({ kind: "passes" });
    expect(await runStoreDecomposeFinish(h.ctx, "demo")).toMatchObject({ status: "ok", result: { kind: "preview" } });
  }
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("binds operation and origin generation while ignoring observation and write order", async () => {
  const h = await createDecomposeTerminalFixture();
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null };
  const prepared = await prepareDecomposeRetirement(h.ctx, "origin");
  if (prepared.status === "refused") throw Error(JSON.stringify(prepared));
  const input = { mode: "retirement-finish" as const, origin: prepared.result.input.map.machine.origin,
    records: prepared.result.records, writes: prepared.result.writes };
  const authority = decomposeApplyAuthority(input);
  expect(decomposeApplyAuthority({ ...input, records: [...input.records].reverse(), writes: [...input.writes].reverse() })).toBe(authority);
  expect(new Set((["retirement-finish", "extraction-finish", "discard", "revise"] as const)
    .map(mode => decomposeApplyAuthority({ ...input, mode }))).size).toBe(4);
  expect(decomposeApplyAuthority({ ...input, origin: { ...input.origin, uid: "ffffffff-ffff-4fff-8fff-ffffffffffff" } })).not.toBe(authority);
});
