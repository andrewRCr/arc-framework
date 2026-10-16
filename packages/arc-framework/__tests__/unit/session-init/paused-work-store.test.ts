/** Shared marking uses lifecycle identity, terminal evidence and the pause's original date. */
import { expect, it } from "vitest";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { MetaPauseSchema } from "../../../src/lib/active/meta-schema.js";
import { recordReferences, RecordReferenceSchema } from "../../../src/lib/store/identity.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/writer.js";
import { writeMetaPause } from "../../../src/lib/store/kinds/meta/writers.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { runPausedWork, PausedWorkResultSchema, markPausedWorkItem } from "../../../src/lib/session-init/paused-work.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";

const now = new Date("2026-10-16T12:00:00.000Z");
const pause = (waitsOn: unknown = null, open = false) => MetaPauseSchema.parse({ pausedBy: "former-owner", since: "2026-09-01T12:00:00.000Z",
  reason: "Waiting for a decision", waitsOn, resumeNotes: "Read the decision first", open });
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
