/** Anchored release preserves checkout changes and every operational record. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, onTestFinished } from "vitest";
import { runPause } from "../../../src/lib/work-unit/verbs/pause-handover.js";
import { runLocusRelease } from "../../../src/lib/locus/release.js";
import { passingProjectionRemovalSlots } from "../../../src/lib/git/worktree-removal.js";
import { readWorktreeMarker, writeWorktreeMarker, resolveWorktreeMarkerPath } from "../../../src/lib/git/worktree-marker.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";
import { testProvenance, success } from "../../helpers/store/suite-tools.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordV3Schema } from "../../../src/lib/errand/identity-record.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "arc-locus-release-"));
  const holder = join(cwd, "holder");
  await mkdir(holder);
  await mkdir(join(cwd, ".git"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const h = createLifecycleHarness();
  const record = await h.seedMeta("demo", { state: "Planning", owner: "andrew", currentWorkflow: "draft-design" });
  const marker = { spawnedByArc: false, createdFor: { kind: "work-unit" as const, name: "demo" }, spawningIdentity: "andrew", createdAt: new Date(0).toISOString() };
  await writeWorktreeMarker(holder, marker);
  const exec: GitExec = async (_command, args) => args[0] === "rev-parse" && args[1] === "--git-common-dir"
    ? { stdout: join(cwd, ".git") } : { stdout: [`worktree ${cwd}`, `HEAD ${"a".repeat(40)}`, "branch refs/heads/main", "", "",
      `worktree ${holder}`, `HEAD ${"b".repeat(40)}`, "branch refs/heads/person", "", ""].join("\0") };
  return { ...h, cwd, holder, record, marker, ctx: { cwd, exec, store: h.store, identity: "andrew", baseBranch: "main" } };
}

it("refuses an owned live work unit and releases its dirty anchored checkout after pause without changing the record", async () => {
  const h = await fixture();
  expect(await runLocusRelease(h.ctx, "demo")).toMatchObject({ status: "refused", reason: expect.stringContaining("arc pause demo --reason <text>") });
  expect(await runPause(h.ctx, { name: "demo", identity: "andrew", reason: "Waiting" })).toMatchObject({ status: "paused" });
  const paused = lifecycleSuccess(await h.store.read({ reference: h.record.reference }));
  await writeFile(join(h.holder, "uncommitted"), "preserve this change");
  const result = await runLocusRelease(h.ctx, "demo");
  expect(result).toMatchObject({ status: "released", checkoutPath: h.holder, spawned: false });
  expect(await readWorktreeMarker(h.holder)).toEqual({ kind: "absent" });
  expect(await readFile(join(h.holder, "uncommitted"), "utf8")).toBe("preserve this change");
  expect(await h.store.read({ reference: paused.reference })).toEqual({ status: "ok", result: paused });
});

it.each(["foreign", "missing", "backlog"])("releases an anchored %s occupant without altering its lifecycle", async kind => {
  const h = await fixture();
  let name = "demo";
  if (kind === "missing") name = "missing";
  if (kind === "backlog") { name = "stub"; await h.seedMeta(name, { state: "Planning", owner: "andrew", currentWorkflow: "draft-design" }, { kind: "backlog", commitment: "planned" }); }
  await writeWorktreeMarker(h.holder, { ...h.marker, createdFor: { kind: "work-unit", name } });
  expect(await runLocusRelease({ ...h.ctx, identity: kind === "foreign" ? "another" : "andrew" }, name))
    .toMatchObject({ status: "released", spawned: false });
  expect(await readWorktreeMarker(h.holder)).toEqual({ kind: "absent" });
  expect(await h.store.read({ reference: h.record.reference })).toEqual({ status: "ok", result: h.record });
});

it("preserves the marker when the projection refuses and clears it once the slot passes", async () => {
  const h = await fixture();
  const slots = { ...passingProjectionRemovalSlots,
    release: async () => ({ kind: "refused" as const, remedy: { text: "Persist this edit before releasing." } }) };
  expect(await runLocusRelease({ ...h.ctx, identity: "another", projectionRemovalSlots: slots }, "demo"))
    .toEqual({ status: "refused", reason: "Persist this edit before releasing." });
  expect(await readWorktreeMarker(h.holder)).toEqual({ kind: "present", marker: h.marker });
  expect(await runLocusRelease({ ...h.ctx, identity: "another", projectionRemovalSlots: passingProjectionRemovalSlots }, "demo"))
    .toMatchObject({ status: "released" });
});

it("preserves a concurrently changed marker generation and releases on a fresh retry", async () => {
  const h = await fixture();
  const next = { ...h.marker, createdAt: new Date(1).toISOString() };
  const slots = { ...passingProjectionRemovalSlots, release: async () => { await writeWorktreeMarker(h.holder, next); return { kind: "released" as const }; } };
  expect(await runLocusRelease({ ...h.ctx, identity: "another", projectionRemovalSlots: slots }, "demo"))
    .toMatchObject({ status: "refused", reason: expect.stringContaining("generation changed") });
  expect(await readWorktreeMarker(h.holder)).toEqual({ kind: "present", marker: next });
  expect(await runLocusRelease({ ...h.ctx, identity: "another" }, "demo")).toMatchObject({ status: "released" });
});

it("moves the entering process out before the projection releases its anchored checkout", async () => {
  const h = await fixture();
  let locus = h.holder;
  const slots = { ...passingProjectionRemovalSlots, release: async () => locus === h.holder
    ? { kind: "refused" as const, remedy: { text: "Process is still inside" } } : { kind: "released" as const } };
  expect(await runLocusRelease({ ...h.ctx, cwd: h.holder, identity: "another", projectionRemovalSlots: slots,
    chdir: path => { locus = path; } })).toMatchObject({ status: "released", nextCheckoutPath: h.cwd });
  expect(await readWorktreeMarker(h.holder)).toEqual({ kind: "absent" });
});

it("directs a missing holder to locus inspection", async () => {
  const h = await fixture();
  expect(await runLocusRelease(h.ctx, "elsewhere")).toMatchObject({ status: "refused", reason: expect.stringContaining("arc locus") });
});

it.each(["Integrating", "Shipped"] as const)("refuses an owned %s work unit with its state-specific exit", async state => {
  const h = await fixture();
  const name = state.toLowerCase();
  await h.seedMeta(name, { state, owner: "andrew", currentWorkflow: state === "Integrating" ? "integrate-work-unit" : null });
  await writeWorktreeMarker(h.holder, { ...h.marker, createdFor: { kind: "work-unit", name } });
  expect(await runLocusRelease(h.ctx, name)).toMatchObject({ status: "refused", reason: expect.stringContaining(`arc teardown ${name}`) });
  expect(await readWorktreeMarker(h.holder)).toMatchObject({ kind: "present" });
});

it.each(["partial-errand", "groom", "housekeep"] as const)("refuses %s with its handoff exits", async kind => {
  const h = await fixture();
  if (kind === "partial-errand") await writeWorktreeMarker(h.holder, { ...h.marker,
    createdFor: { kind, slug: kind, claimId: null }, provisioning: "ready" });
  else await writeWorktreeMarker(h.holder, { ...h.marker,
    createdFor: { kind, slug: kind, claimId: "a".repeat(32) }, provisioning: "ready" });
  const result = await runLocusRelease({ ...h.ctx, cwd: h.holder });
  expect(result).toMatchObject({ status: "refused", reason: expect.stringMatching(kind === "partial-errand" ? /finish.*promote.*abandon/iu
    : kind === "groom" ? /ship.*close.*abandon/iu : /complete.*abandon/iu) });
  expect(await readWorktreeMarker(h.holder)).toMatchObject({ kind: "present" });
});

it("refuses a full Errand with its leave exit", async () => {
  const h = await fixture();
  const claimId = "a".repeat(32);
  const record = TransientIdentityRecordV3Schema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "small-fix", claimId,
    intent: "Fix it", branch: "chore/small-fix", origin: "description", originEntry: null, state: "open", savedHead: null,
    changeRequest: null, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() });
  const transient = createReferenceFixture({}, { "work-item/record": { parser: content => {
    const parsed = TransientIdentityRecordV3Schema.safeParse(JSON.parse(content));
    return parsed.success ? { success: true, data: parsed.data } : { success: false, error: parsed.error.message };
  } } });
  success(await transient.store.write({ action: "put", expected: null, content: serializeTransientIdentityRecord(record),
    reference: recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "small-fix" })),
    placement: { kind: "active" }, provenance: testProvenance }));
  await writeWorktreeMarker(h.holder, { ...h.marker, createdFor: { kind: "errand", slug: "small-fix", claimId }, provisioning: "ready" });
  expect(await runLocusRelease({ ...h.ctx, store: transient.store, cwd: h.holder })).toMatchObject({ status: "refused", reason: expect.stringContaining("arc errand leave small-fix") });
});

it("preserves the lookup's unreadable-marker message and releases after repair", async () => {
  const h = await fixture();
  await writeFile(resolveWorktreeMarkerPath(h.holder), "broken json");
  expect(await runLocusRelease({ ...h.ctx, identity: "another" }, "demo"))
    .toMatchObject({ status: "refused", reason: expect.stringContaining(resolveWorktreeMarkerPath(h.holder)) });
  await writeWorktreeMarker(h.holder, h.marker);
  expect(await runLocusRelease({ ...h.ctx, identity: "another" }, "demo")).toMatchObject({ status: "released" });
});
