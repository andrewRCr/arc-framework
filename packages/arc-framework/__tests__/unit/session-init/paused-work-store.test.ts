/** Shared marking uses lifecycle identity, terminal evidence and the pause's original date. */
import { expect, it } from "vitest";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { MetaPauseSchema, ParsedMetaRecordSchema } from "../../../src/lib/active/meta-schema.js";
import { recordReferences, RecordReferenceSchema } from "../../../src/lib/store/identity.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/writer.js";
import { writeMetaPause } from "../../../src/lib/store/kinds/meta/writers.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { runPausedWork, PausedWorkResultSchema, markPausedWorkItem } from "../../../src/lib/session-init/paused-work.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { createMemoryRemote } from "../../helpers/store/sync.js";
import { ReferenceBackend } from "../../helpers/store/reference-backend.js";
import { runPause } from "../../../src/lib/work-unit/verbs/pause-handover.js";
import { runStoreRename } from "../../../src/lib/work-unit/verbs/rename-store.js";
import { batchLifecycleWrites } from "../../../src/lib/store/lifecycle-write.js";
import type { Store } from "../../../src/lib/store/contract.js";

const now = new Date("2026-10-16T12:00:00.000Z");
const pause = (waitsOn: unknown = null, open = false) => MetaPauseSchema.parse({ pausedBy: "former-owner", since: "2026-09-01T12:00:00.000Z",
  reason: "Waiting for a decision", waitsOn, resumeNotes: "Read the decision first", open });

it("refuses disputed pause ownership after sync and lists only the explicitly resolved owner on retry", async () => {
  const h = createLifecycleHarness(), initial = await h.seedMeta("paused", { state: "Planning", owner: "andrew", currentWorkflow: "draft-design" });
  lifecycleSuccess(await h.store.write({ ...recordPut(initial, { content: writeMetaPause(initial.content, pause()) }), provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.sync());
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  const local = lifecycleSuccess(await h.store.read({ reference: initial.reference })), other = lifecycleSuccess(await writer.read({ reference: initial.reference }));
  const content = local.content.replace("Waiting for a decision", "Local reason"), provenance = { verb: "update", lifecycleAction: "update" };
  lifecycleSuccess(await h.store.write({ ...recordPut(local, { content }), provenance }));
  lifecycleSuccess(await writer.write({ ...recordPut(other, { content: other.content.replaceAll("andrew", "another").replace("Waiting for a decision", "Remote reason") }), provenance }));
  lifecycleSuccess(await h.store.sync());
  const disputed = lifecycleSuccess(await h.store.read({ reference: initial.reference })); expect(disputed.conflicts).toHaveLength(1);
  const read = (identity: string) => runPausedWork({ store: h.store, identity, reviewAfterDays: 14, now, findHoldingCheckout: async () => "/holder" });
  for (const owner of ["andrew", "another"]) await expect(read(owner)).rejects.toThrow(/conflicts.*resolve.*retry/iu);
  lifecycleSuccess(await h.store.write({ ...recordPut(disputed, { content }), resolves: disputed.conflicts, provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  expect(await read("andrew")).toMatchObject({ items: [{ slug: "paused", reason: "Local reason" }] });
  expect(await read("another")).toEqual({ items: [] });
});
it("marks work waiting on a shipped work unit resumable", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("dependency", { state: "Shipped", currentWorkflow: null });
  expect(await markPausedWorkItem({ slug: "demo", pause: pause({ kind: "work-unit", slug: "dependency" }) },
    { store: h.store, reviewAfterDays: 14, now })).toMatchObject({ marks: ["resumable"], actions: [] });
});
it.each([null, { kind: "note", text: "Wait for a response" }])("marks an old pause waiting on %j review-due with filled review choices", async waitsOn => {
  const h = createLifecycleHarness();
  const result = await markPausedWorkItem({ slug: "demo", pause: pause(waitsOn) }, { store: h.store, reviewAfterDays: 14, now });
  expect(result.marks).toEqual(["review-due"]);
  expect(result.reviewPrompt).toContain("arc resume demo");
  expect(result.actions).toEqual([
    { text: expect.any(String), argv: ["arc", "resume", "demo"] },
    { text: expect.stringContaining("arc handover demo --to <identity>") },
    { text: expect.any(String), argv: ["arc", "pause", "demo", "--open"] },
    { text: expect.any(String), argv: ["arc", "abandon", "demo", "--yes"] },
  ]);
});

it("lists by the current owner and selects resume or materialize for the actual holding checkout", async () => {
  const h = createLifecycleHarness();
  for (const [slug, owner] of [["held", "andrew"], ["released", "andrew"], ["in-place", "andrew"], ["others", "someone"]] as const) {
    const record = await h.seedMeta(slug, { state: "Planning", owner, currentWorkflow: "draft-design" });
    const content = writeMetaPause(record.content, pause(null, true));
    lifecycleSuccess(await h.store.write({ ...recordPut(record, { content }), provenance: { verb: "pause", lifecycleAction: "pause" } }));
  }
  const result = await runPausedWork({ store: h.store, identity: "andrew", reviewAfterDays: 14, now,
    findHoldingCheckout: async slug => slug === "held" ? "/held" : null,
    markerlessCheckouts: [{ workUnit: "in-place", checkoutPath: "/unmarked" }] });
  expect(result.items.map(item => item.slug)).toEqual(["held", "in-place", "released"]);
  expect(result.items[0]).toMatchObject({ open: true, reason: "Waiting for a decision", marks: ["review-due"],
    actions: [{ argv: ["arc", "resume", "held"] }, { text: expect.any(String) }, { argv: ["arc", "abandon", "held", "--yes"] }] });
  expect(result.items[1]?.actions[0]).toMatchObject({ argv: ["arc", "materialize", "in-place", "--here"], checkout: "/unmarked" });
  expect(result.items[2]?.actions[0]).toMatchObject({ argv: ["arc", "materialize", "released"] });
  expect(JSON.stringify(result)).not.toContain("arc pause held --open");
  expect(PausedWorkResultSchema.parse(result)).toEqual(result);
});

it.each(["abandon", "decompose"] as const)("marks a pause waiting on %s review-due immediately", async kind => {
  const h = createLifecycleHarness();
  const record = await h.seedMeta("dependency", { owner: "andrew" });
  if (kind === "decompose") await h.seedMeta("child");
  const owner = record.reference.owner;
  const lineage = writeLineageRecord({ schemaVersion: 2, kind,
    origin: { name: SlugSchema.parse("dependency"), ...("uid" in owner && owner.uid !== undefined ? { uid: owner.uid } : {}) },
    successors: kind === "decompose" ? [{ name: SlugSchema.parse("child") }] : [], incoming: [], ...(kind === "decompose" ? { outgoing: [] } : {}) });
  await h.seed(recordReferences["lineage/transition"](owner), lineage);
  lifecycleSuccess(await h.store.write({ action: "remove", reference: record.reference, expected: record.version,
    provenance: { verb: kind, lifecycleAction: "transition" } }));
  const fresh = { ...pause({ kind: "work-unit", slug: "dependency" }), since: now.toISOString() };
  expect(await markPausedWorkItem({ slug: "demo", pause: fresh }, { store: h.store, reviewAfterDays: 14, now }))
    .toMatchObject({ marks: ["review-due"], reviewPrompt: expect.stringContaining("arc abandon demo --yes") });
});

it("resolves a shipped prerequisite through its former slug", async () => {
  const h = createLifecycleHarness();
  const record = await h.seedMeta("former", { state: "Shipped", currentWorkflow: null });
  const reference = RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name: "current" } });
  lifecycleSuccess(await h.store.write({ ...recordPut(record, { content: record.content.replaceAll("former", "current") }), reference,
    provenance: { verb: "rename", lifecycleAction: "transition" } }));
  expect(await markPausedWorkItem({ slug: "demo", pause: pause({ kind: "work-unit", slug: "former" }) },
    { store: h.store, reviewAfterDays: 14, now })).toMatchObject({ marks: ["resumable"] });
});

it("uses the pause's original since, has a strict review threshold, and omits opening an open pause", async () => {
  const h = createLifecycleHarness();
  const exactlyFourteenDays = { ...pause(), since: "2026-10-02T12:00:00.000Z" };
  expect(await markPausedWorkItem({ slug: "demo", pause: exactlyFourteenDays }, { store: h.store, reviewAfterDays: 14, now }))
    .toEqual({ marks: [], actions: [] });
  const result = await markPausedWorkItem({ slug: "demo", pause: pause(null, true) }, { store: h.store, reviewAfterDays: 14, now });
  expect(result.marks).toEqual(["review-due"]);
  expect(result.reviewPrompt).not.toContain("--open");
  expect(result.actions.some(action => action.argv?.includes("--open"))).toBe(false);
});

async function renamedPrerequisite() {
  const h = createLifecycleHarness();
  const dependency = await h.seedMeta("dependency", { state: "Planning", owner: "andrew", currentWorkflow: "draft-design" });
  const dependent = await h.seedMeta("paused", { state: "Planning", owner: "andrew", currentWorkflow: "draft-design" });
  const ctx = { store: h.store, cwd: "/memory", identity: "andrew", baseBranch: "main", now: () => new Date("2026-10-15T12:00:00Z"),
    exec: async () => ({ stdout: "", stderr: "" }),
    locusPorts: { findHoldingCheckout: async () => null, checkMarkerExclusivity: async () => ({ kind: "clear" as const }), writeAnchoredMarker: async () => ({ kind: "unadmitted" as const }) } };
  expect(await runPause(ctx, { name: "paused", identity: "andrew", reason: "Waiting for dependency", waitsOn: "dependency" })).toMatchObject({ status: "paused" });
  expect(await runStoreRename(ctx, { sourceSlug: "dependency", targetSlug: "current" })).toMatchObject({ status: "renamed" });
  const savedPause = MetaPauseSchema.parse(ParsedMetaRecordSchema.parse(lifecycleSuccess(await h.store.read({ reference: dependent.reference })).fields).pause);
  expect(savedPause).toMatchObject({ since: "2026-10-15T12:00:00.000Z", waitsOn: { kind: "work-unit", slug: "dependency" } });
  const end = async (kind: "abandon" | "decompose", name = "current") => {
    const selected = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse(name) }));
    const primary = lifecycleSuccess(await h.store.read({ reference: selected.reference }));
    if (primary.reference.owner.type !== "work-item") throw new Error("Missing work item");
    if (kind === "decompose") await h.seedMeta("child");
    const lineage = recordReferences["lineage/transition"](primary.reference.owner);
    lifecycleSuccess(await batchLifecycleWrites(h.store, [{ action: "remove", reference: primary.reference, expected: primary.version },
      { action: "put", reference: lineage, expected: null, content: writeLineageRecord({ schemaVersion: 2, kind,
        origin: { name: primary.reference.owner.name, uid: primary.reference.owner.uid }, successors: kind === "decompose" ? [{ name: SlugSchema.parse("child") }] : [],
        incoming: [], retiredBranches: [], ...(kind === "decompose" ? { outgoing: [] } : {}) }) }], { verb: kind, lifecycleAction: kind }));
    return lifecycleSuccess(await h.store.read({ reference: lineage }));
  };
  return { ...h, ctx, dependency, dependent, savedPause, end };
}
it.each(["abandon", "decompose"] as const)("retains a pause's former-name prerequisite through rename and %s", async kind => {
  const f = await renamedPrerequisite(), item = { slug: "paused", pause: f.savedPause };
  expect(await markPausedWorkItem(item, { store: f.store, reviewAfterDays: 14, now })).toEqual({ marks: [], actions: [] });
  await f.end(kind);
  const before = lifecycleSuccess(await f.store.read({ reference: f.dependent.reference }));
  expect(await markPausedWorkItem(item, { store: f.store, reviewAfterDays: 14, now })).toMatchObject({ marks: ["review-due"],
    reviewPrompt: expect.stringContaining("arc handover paused --to <identity>"), actions: expect.arrayContaining([{ text: expect.any(String), argv: ["arc", "resume", "paused"] }]) });
  expect(await runPausedWork({ store: f.store, identity: "andrew", reviewAfterDays: 14, now, findHoldingCheckout: async () => "/paused" }))
    .toMatchObject({ items: [{ slug: "paused", waitsOn: { kind: "work-unit", slug: "dependency" }, marks: ["review-due"] }] });
  expect(lifecycleSuccess(await f.store.read({ reference: f.dependent.reference }))).toEqual(before);
});
it("refuses unavailable terminal former-name history and resumes after that authority is restored", async () => {
  const f = await renamedPrerequisite(); await f.end("abandon");
  const store = Object.create(f.store) as Store;
  let repaired = false;
  store.history = input => repaired ? f.store.history(input) : Promise.resolve({ status: "refused", refusal: {
    code: "namespace-corrupt", class: "terminal", namespace: "history", condition: "Terminal history is unavailable.",
    remedy: { text: "Restore terminal history, then retry pause review." } } });
  const item = { slug: "paused", pause: f.savedPause }, options = { store, reviewAfterDays: 14, now };
  await expect(markPausedWorkItem(item, options)).rejects.toThrow("Terminal history is unavailable. Restore terminal history, then retry pause review.");
  repaired = true;
  expect(await markPausedWorkItem(item, options)).toMatchObject({ marks: ["review-due"] });
});
it("refuses ambiguous terminal former names and accepts an explicitly named prerequisite", async () => {
  const f = await renamedPrerequisite(); await f.end("abandon");
  await f.seedMeta("dependency", { state: "Planning", owner: "andrew", currentWorkflow: "draft-design" });
  expect(await runStoreRename(f.ctx, { sourceSlug: "dependency", targetSlug: "second" })).toMatchObject({ status: "renamed" });
  await f.end("abandon", "second");
  await expect(markPausedWorkItem({ slug: "paused", pause: f.savedPause }, { store: f.store, reviewAfterDays: 14, now }))
    .rejects.toThrow(/ambiguous.*terminal.*prerequisite.*retry/isu);
  expect(await markPausedWorkItem({ slug: "paused", pause: { ...f.savedPause, waitsOn: { kind: "work-unit", slug: SlugSchema.parse("current") } } },
    { store: f.store, reviewAfterDays: 14, now })).toMatchObject({ marks: ["review-due"] });
});
it("names missing prerequisite authority and accepts a repaired explicit prerequisite", async () => {
  const h = createLifecycleHarness(), item = { slug: "paused", pause: pause({ kind: "work-unit", slug: "missing" }) };
  await expect(markPausedWorkItem(item, { store: h.store, reviewAfterDays: 14, now })).rejects.toThrow(/no authenticated terminal.*retry/iu);
  await h.seedMeta("missing", { state: "Shipped", currentWorkflow: null });
  expect(await markPausedWorkItem(item, { store: h.store, reviewAfterDays: 14, now })).toMatchObject({ marks: ["resumable"] });
});
it("withholds conflicted terminal alias authority after sync and resumes after explicit resolution", async () => {
  const f = await renamedPrerequisite(); await f.seedMeta("second");
  const remote = createMemoryRemote(); f.store.context.publication.remote = remote;
  lifecycleSuccess(await f.store.sync());
  const writer = new ReferenceBackend({ state: remote.state, registry: f.store.context.registry });
  const other = lifecycleSuccess(await writer.read({ reference: f.dependency.reference }));
  if (other.reference.owner.type !== "work-item") throw new Error("Missing work item");
  const terminal = await f.end("decompose");
  lifecycleSuccess(await batchLifecycleWrites(writer, [{ action: "remove", reference: other.reference, expected: other.version },
    { action: "put", reference: recordReferences["lineage/transition"](other.reference.owner), expected: null,
      content: writeLineageRecord({ schemaVersion: 2, kind: "decompose", origin: { name: other.reference.owner.name, uid: other.reference.owner.uid },
        successors: [{ name: SlugSchema.parse("second") }], incoming: [], outgoing: [], retiredBranches: [] }) }], { verb: "decompose", lifecycleAction: "decompose" }));
  lifecycleSuccess(await f.store.sync());
  const disputed = lifecycleSuccess(await f.store.read({ reference: terminal.reference }));
  expect(disputed.conflicts).toHaveLength(1);
  const item = { slug: "paused", pause: f.savedPause }, options = { store: f.store, reviewAfterDays: 14, now };
  const failure = await markPausedWorkItem(item, options).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).toMatch(/unresolved terminal lineage.*resolve.*retry/isu);
  for (const reference of disputed.conflicts) expect(String(failure)).toContain(JSON.stringify(reference));
  for (const reference of disputed.conflicts) {
    const conflict = lifecycleSuccess(await f.store.read({ reference }));
    lifecycleSuccess(await f.store.write({ action: "remove", reference, expected: conflict.version,
      resolves: [reference], provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  }
  expect(await markPausedWorkItem(item, options)).toMatchObject({ marks: ["review-due"] });
});
