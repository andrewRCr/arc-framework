import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
/** Atomic retirement through the lifecycle executor and retryable physical cleanup. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { createDecomposeRetirementFixture } from "../../../fixtures/decompose-retirement.js";
import { createDefaultLocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
import { prepareDecomposeRetirement } from "../../../../src/lib/decompose/retirement-plan.js";
import { runStoreDecomposeRetirement, applyDecomposeRetirement } from "../../../../src/lib/decompose/retirement.js";
import { retirementLink } from "../../../helpers/store/retirement-harness.js";
import { runStoreTeardown } from "../../../../src/lib/work-unit/verbs/teardown-store.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { readWorkUnit, readLifecycleMetaFields } from "../../../../src/lib/store/lifecycle-write.js";
import { resolveWorktreeMarkerPath } from "../../../../src/lib/git/worktree-marker.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";

it("retires a stub in one terminal batch with only a holding-checkout lookup", async () => {
  const h = await createDecomposeTerminalFixture();
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) };
  let lookedUp = false;
  h.ctx.executor.locusPorts!.findHoldingCheckout = async () => { if (lookedUp) throw Error("Repeated holding lookup"); lookedUp = true; return { kind: "none" }; };
  const batch = h.store.batch.bind(h.store);
  h.store.batch = input => { if (!lookedUp) throw Error("Retirement wrote before its holding lookup"); return batch(input); };
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  const result = await runStoreDecomposeRetirement(h.ctx, "origin");
  expect(result).toMatchObject({ status: "ok", result: { outcome: { status: "ok" }, notices: [] } });
  expect(await readWorkUnit(h.store, "origin")).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  const lineage = lifecycleSuccess(await h.store.read({ reference: recordReferences["lineage/transition"](primary.reference.owner) }));
  expect(lineage.fields).toMatchObject({ kind: "decompose", retiredBranches: [] });
  const consumer = lifecycleSuccess(await readWorkUnit(h.store, "consumer"));
  const histories = await Promise.all([primary.reference, lineage.reference,
    recordReferences["work-item/cut-map"](primary.reference.owner), consumer.reference]
    .map(async reference => lifecycleSuccess(await h.store.history({ reference }))[0]));
  const batches = histories.map(entry => {
    if (entry === undefined || !("batchId" in entry.provenance)) throw Error("Expected terminal batch provenance.");
    expect(entry.provenance.lifecycleAction).toBe("terminal");
    return entry.provenance.batchId;
  });
  expect(new Set(batches).size).toBe(1);
  expect(batches.every(id => id !== undefined)).toBe(true);
  expect(await h.store.read({ reference: recordReferences["work-item/cut-map"](primary.reference.owner) }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(lifecycleSuccess(readLifecycleMetaFields(lifecycleSuccess(await readWorkUnit(h.store, "consumer"))))
    .dependsOn).toEqual(["member-a"]);
});

it("refuses a dirty spawned checkout before writes and proceeds after its repair", async () => {
  const h = await createDecomposeRetirementFixture({ held: true, spawned: true, dirty: true });
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeRetirement(h.ctx, "demo")).toMatchObject({ status: "refused", reason: "removal-check",
    remedy: { text: expect.stringContaining("personal.txt") } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const original = h.ctx.executor.exec;
  const clean: typeof original = (command, args, options) => args[0] === "status"
    ? Promise.resolve({ stdout: "" }) : original(command, args, options);
  h.ctx.executor.exec = clean;
  h.ctx.removal!.exec = clean;
  h.ctx.storeTeardown!.exec = clean;
  expect(await runStoreDecomposeRetirement(h.ctx, "demo")).toMatchObject({ status: "ok" });
  expect(await readWorkUnit(h.store, "demo")).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});

it("releases a dirty retained checkout's claim and preserves its files", async () => {
  const h = await createDecomposeRetirementFixture({ held: true, dirty: true });
  let admitted = false;
  h.ctx.removal!.check = async () => {
    expect((await readWorkUnit(h.store, "demo")).status).toBe("ok");
    admitted = true;
    return { kind: "passes" };
  };
  const batch = h.store.batch.bind(h.store);
  h.store.batch = input => { if (!admitted) throw Error("Terminal write preceded checkout admission"); return batch(input); };
  const readMarker = h.ctx.storeTeardown!.readMarker!;
  h.ctx.storeTeardown!.readMarker = async path => {
    expect(await readWorkUnit(h.store, "demo")).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    return readMarker(path);
  };
  const markerPath = resolveWorktreeMarkerPath("/repo");
  const files = new Map([[markerPath, "claim"], ["/repo/personal.txt", "owned changes"]]);
  h.ctx.storeTeardown!.worktreeFs = { ...h.ctx.storeTeardown!.worktreeFs!,
    removeFile: async path => { if (path !== markerPath) throw Error(`Unexpected file removal: ${path}`); files.delete(path); } };
  expect(await runStoreDecomposeRetirement(h.ctx, "demo")).toMatchObject({ status: "ok", result: {
    notices: expect.arrayContaining([expect.stringContaining("Released checkout /repo")]) } });
  expect(files.has(markerPath)).toBe(false);
  expect(files.get("/repo/personal.txt")).toBe("owned changes");
  expect(h.state().current).toBeNull();
});

it("preserves a retained checkout projection refusal and finishes after its repair", async () => {
  const h = await createDecomposeRetirementFixture({ held: true, dirty: true });
  let blocked = true;
  const remedy = { text: "Resolve the projected record before releasing this checkout.", argv: ["arc", "save"] };
  h.ctx.removal!.check = async () => blocked ? { kind: "would-refuse", remedy } : { kind: "passes" };
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeRetirement(h.ctx, "demo")).toMatchObject({ status: "refused", reason: "removal-check", remedy });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  blocked = false;
  const applied = await runStoreDecomposeRetirement(h.ctx, "demo");
  expect(applied).toMatchObject({ status: "ok" });
  if (applied.status === "refused") throw Error(JSON.stringify(applied));
  expect(applied.result.outcome.continuation).toBeUndefined();
});

it("persists retirement before cleanup failure and completes its teardown retry", async () => {
  const h = await createDecomposeRetirementFixture({ held: true });
  const teardown = h.ctx.storeTeardown!;
  const original = teardown.readMarker;
  teardown.readMarker = async () => { throw Error("marker unreadable"); };
  const applied = await runStoreDecomposeRetirement(h.ctx, "demo");
  expect(applied).toMatchObject({ status: "ok", result: { outcome: { continuation: {
    argv: ["arc", "teardown", boundWorkUnitSubject(h.meta).uid], reason: expect.stringContaining("marker unreadable") } } } });
  expect(await readWorkUnit(h.store, "demo")).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  teardown.readMarker = original;
  expect(await runStoreTeardown(teardown, { subject: { kind: "slug", slug: boundWorkUnitSubject(h.meta).uid }, base: "main" })).toMatchObject({ status: "torn-down",
    notices: expect.arrayContaining([expect.stringContaining("Released checkout /repo")]) });
});

it("surfaces teardown's notice when a linked planning branch has unlanded commits", async () => {
  const h = await createDecomposeRetirementFixture({ branches: [retirementLink("plan/demo")], unlanded: true });
  h.refs.delete("refs/remotes/origin/plan/demo");
  h.refs.delete("remote/plan/demo");
  const applied = await runStoreDecomposeRetirement(h.ctx, "demo");
  expect(applied).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([expect.stringContaining("Kept plan/demo")]) } });
  expect(h.refs.has("refs/heads/plan/demo")).toBe(true);
  if (applied.status === "refused") throw Error(JSON.stringify(applied));
  expect(applied.result.outcome.continuation).toBeUndefined();
});

it.each(["incomplete", "unreadable"] as const)("lifts the executor's %s inventory refusal and finishes after repair", async kind => {
  const h = await createDecomposeTerminalFixture();
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) };
  const plan = await prepareDecomposeRetirement(h.ctx, "origin");
  if (plan.status === "refused") throw Error(JSON.stringify(plan));
  const list = h.store.list.bind(h.store);
  let broken = true;
  const remedy = { text: "Restore the missing inventory evidence.", argv: ["arc", "state", "pull"] };
  h.store.list = async input => input.kind !== "work-item/meta" || !broken ? list(input) : { status: "ok", result: kind === "unreadable"
    ? { status: "unreadable", condition: "Inventory cannot be read.", remedy }
    : { status: "complete", records: [], missed: true, diagnostics: [
      { kind: "unreadable", key: "work-item/meta:other", condition: "Missing inventory record.", remedy }] } };
  const before = lifecycleSuccess(await h.store.version());
  expect(await applyDecomposeRetirement(h.ctx, plan.result)).toMatchObject({ status: "refused", reason: "inventory-incomplete", remedy });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  broken = false;
  expect(await runStoreDecomposeRetirement(h.ctx, "origin")).toMatchObject({ status: "ok" });
});

it("revalidates authored destination content without putting it and names a fresh preview after conflict", async () => {
  const h = await createDecomposeTerminalFixture();
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) };
  const plan = await prepareDecomposeRetirement(h.ctx, "origin");
  if (plan.status === "refused") throw Error(JSON.stringify(plan));
  const destination = plan.result.records.find(record => record.reference.owner.name === "member-a" && record.reference.kind === "work-item/draft");
  if (destination === undefined) throw Error("Expected allocated destination content.");
  const authored = await h.handEdit(destination, `${destination.content}\nMore authored detail.\n`);
  const before = lifecycleSuccess(await h.store.version());
  expect(await applyDecomposeRetirement(h.ctx, plan.result)).toMatchObject({ status: "refused", reason: "version-conflict",
    remedy: { argv: ["arc", "decompose", "origin", "--finish"] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(await runStoreDecomposeRetirement(h.ctx, "origin")).toMatchObject({ status: "ok" });
  expect(lifecycleSuccess(await h.store.read({ reference: authored.reference }))).toEqual(authored);
});
