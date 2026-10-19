/** Session offers distinguish an unavailable ref inventory from branch absence. */
import { afterEach, expect, it, vi } from "vitest";
import { createStoreSessionProbes } from "../../../../src/handlers/status/store-session.js";
import { createTestStatusContext } from "../../../helpers/status-context.js";
import { handleLifecycleStatus } from "../../../../src/handlers/status/lifecycle.js";
import { readUserInboxFromStore } from "../../../../src/handlers/status/session-context.js";
import { createLifecycleHarness, lifecycleSuccess as ok } from "../../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { TransientIdentityRecordV3Schema, serializeTransientIdentityRecord } from "../../../../src/lib/errand/identity-record.js";
import { MetaPauseSchema } from "../../../../src/lib/active/meta-schema.js";
import { writeMetaPause } from "../../../../src/lib/store/kinds/meta/writers.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import type { CleanupBaseEvidence } from "../../../../src/lib/session-init/cleanup-remote-evidence.js";
import { DerivedLocusFrameSchema } from "../../../../src/lib/locus/derived-schema.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";

afterEach(() => { vi.restoreAllMocks(); process.exitCode = undefined; });
const head = "a".repeat(40);
const pausedContent = (content: string) => writeMetaPause(content, MetaPauseSchema.parse({ pausedBy: "alice", since: "2026-09-01T00:00:00Z",
  reason: "Waiting", waitsOn: null, open: false, resumeNotes: "" }));
async function fixture() {
  const h = createLifecycleHarness(); h.store.environment.identity = "alice";
  for (const name of ["demo", "waiting", "held"]) {
    const record = await h.seedMeta(name, { owner: "alice" }, { kind: "active" },
      { branches: [{ repository: "project", ref: `feat/${name}`, linkedAs: "created", excluded: [] }] });
    if (name !== "demo") ok(await h.store.write({ ...recordPut(record, { content: pausedContent(record.content) }),
      provenance: { verb: "pause", lifecycleAction: "pause" } }));
  }
  await h.seedMeta("planning", { owner: "alice", state: "Planning", currentWorkflow: "draft-design" });
  const errand = TransientIdentityRecordV3Schema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "fix-it", owner: "alice",
    intent: "Fix it", claimId: "b".repeat(32), branch: "chore/fix-it", origin: "description", originEntry: null,
    state: "paused", savedHead: head, changeRequest: null, createdAt: "2026-10-18T00:00:00Z", updatedAt: "2026-10-18T00:00:00Z" });
  await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "fix-it" })),
    serializeTransientIdentityRecord(errand), { kind: "active" }, { branches: [{ repository: "project", ref: "chore/fix-it", linkedAs: "created", excluded: [] }] });
  let repaired = false;
  const fake = scriptGitExec([
    { match: { predicate: args => args[0] === "for-each-ref" && args[1]?.includes("objectname") === true },
      responses: [() => repaired ? { stdout: "" } : { failure: { exitCode: 128, stderr: "Refs unreadable" } }] },
    { match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] },
    { match: ["config", "--null", "--get", "arc.identity"], responses: [{ stdout: "alice\0" }] },
    { match: { prefix: ["cherry"] }, responses: [{ stdout: "" }] },
  ]);
  const findHoldingCheckout = async (name: string) => name === "held" ? "/held" : null;
  const caller = { kind: "unmanaged-checkout", subject: null, checkout: { path: "/current", head, branch: "main", detached: false, primary: false, folderPresent: true },
    markerGeneration: null, parentCheckoutPath: null, origin: null, identity: null, context: null, lifecycleLocation: null, diagnostics: [] };
  const frame = DerivedLocusFrameSchema.parse({ roster: [caller], entering: { kind: "selected", row: caller },
    primaryAvailability: { kind: "unsafe", checkoutPath: null, reasons: ["No primary in this fixture"] }, identityDiscovery: { kind: "absent" }, active: null });
  const probes = () => createStoreSessionProbes({ store: h.store, cwd: "/current", exec: fake.exec, identity: "alice",
    readFrame: async () => frame, readSettings: async () => ({}), projectId: async () => "project", findHoldingCheckout,
    readUserInbox: id => readUserInboxFromStore(h.store, id) });
  return { ...h, exec: fake.exec, probes, errand, findHoldingCheckout, repair: () => { repaired = true; } };
}

it("withholds a named work-unit offer on unknown branch location and restores it on the next successful invocation", async () => {
  const h = await fixture();
  const blocked = await h.probes().materializableWorkUnits();
  expect(blocked.candidates.map(item => item.name)).toEqual(["planning"]);
  expect(blocked.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/local.*refs.*repair.*retry/iu)]));
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  await handleLifecycleStatus(await createTestStatusContext({ store: h.store, exec: h.exec }), "demo", { json: true }, { findHoldingCheckout: h.findHoldingCheckout });
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({ slug: "demo", state: "active", owner: "alice",
    warnings: expect.arrayContaining([expect.stringMatching(/local.*refs.*repair.*retry/iu)]) });
  h.repair();
  expect((await h.probes().materializableWorkUnits()).candidates.map(item => item.name)).toEqual(["demo", "planning"]);
});

it("keeps pause review choices and a known holder while withholding unknown materialization", async () => {
  const h = await fixture(), result = await h.probes().pausedWork();
  const waiting = result.items.find(item => item.slug === "waiting"), held = result.items.find(item => item.slug === "held");
  expect(waiting).toMatchObject({ reason: "Waiting", marks: ["review-due"] });
  expect(waiting?.actions.some(action => action.argv?.includes("materialize"))).toBe(false);
  expect(waiting?.actions).toEqual(expect.arrayContaining([{ text: expect.stringMatching(/local.*branch.*repair.*retry/iu) },
    { text: "arc handover waiting --to <identity>" }, { text: "arc resume waiting", argv: ["arc", "resume", "waiting"] }]));
  expect(held?.actions[0]).toEqual({ text: "arc resume held", argv: ["arc", "resume", "held"] });
  h.repair();
  expect((await h.probes().pausedWork()).items.find(item => item.slug === "waiting")?.actions[0]?.argv).toEqual(["arc", "materialize", "waiting"]);
});

it("withholds remote Errand materialization when local presence is unknown, then offers it after a successful empty read", async () => {
  const h = await fixture();
  const baseEvidence: CleanupBaseEvidence = { remoteSyncEnabled: true,
    snapshot: { kind: "available", scope: "all-heads", tips: { main: head, "chore/fix-it": head } },
    objectAvailability: { kind: "complete", commits: { [head]: true } }, history: { kind: "complete" } };
  const input = { exec: h.exec, currentBranch: "main", hasBackingMeta: false, includeDiscovery: true,
    baseBranch: "main", staleThresholdDays: 3, remoteTips: new Map([["chore/fix-it", head]]), baseEvidence,
    nudge: { shouldNudge: false, markerPath: "/nudge", today: "2026-10-18" } };
  const blocked = await h.probes().errandState(input);
  expect(blocked.materializable.candidates).toEqual([]);
  expect(blocked.residue).toEqual([]);
  expect(blocked.inFlight.errands).toEqual([expect.objectContaining({ slug: "fix-it", state: "blocked", blockingReason: "evidence-unavailable" })]);
  expect(blocked.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/local.*refs.*repair.*retry/iu)]));
  h.repair();
  const repaired = await h.probes().errandState(input);
  expect(repaired.materializable.candidates).toEqual([expect.objectContaining({ slug: "fix-it", expectedHead: head })]);
  expect(repaired.inFlight.errands).toEqual([expect.objectContaining({ slug: "fix-it", state: "merged-cleanup" })]);
});

it("carries failed ref evidence to an Errand acquired after the cached oracle", async () => {
  const h = await fixture(), probes = h.probes(); await probes.getOracle();
  await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "later" })),
    serializeTransientIdentityRecord(TransientIdentityRecordV3Schema.parse({ ...h.errand, slug: "later", branch: "chore/later", claimId: "c".repeat(32) })),
    { kind: "active" }, { branches: [{ repository: "project", ref: "chore/later", linkedAs: "created", excluded: [] }] });
  const input = { exec: h.exec, currentBranch: "main", hasBackingMeta: false, includeDiscovery: true, baseBranch: "main", staleThresholdDays: 3,
    remoteTips: new Map([["chore/later", head]]), nudge: { shouldNudge: false, markerPath: "/nudge", today: "2026-10-18" } };
  expect((await probes.errandState(input)).materializable.candidates).toEqual([]);
  h.repair();
  expect((await h.probes().errandState(input)).materializable.candidates.map(item => item.slug)).toEqual(["later"]);
});

it("carries failed ref evidence to paused work listed after the cached oracle", async () => {
  const h = await fixture(), probes = h.probes(); await probes.getOracle();
  const record = await h.seedMeta("later", { owner: "alice" }, { kind: "active" },
    { branches: [{ repository: "project", ref: "feat/later", linkedAs: "created", excluded: [] }] });
  ok(await h.store.write({ ...recordPut(record, { content: pausedContent(record.content) }), provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const item = (await probes.pausedWork()).items.find(item => item.slug === "later");
  expect(item).toMatchObject({ marks: ["review-due"] });
  expect(item?.actions.some(action => action.argv?.includes("materialize"))).toBe(false);
  expect(item?.actions[0]).toEqual({ text: expect.stringMatching(/local.*branch.*repair.*retry/iu) });
  h.repair();
  expect((await h.probes().pausedWork()).items.find(item => item.slug === "later")?.actions[0]?.argv).toEqual(["arc", "materialize", "later"]);
});

it("checks a current work-unit branch link after branchless oracle membership was cached", async () => {
  const h = await fixture(), probes = h.probes(); await probes.getOracle();
  const resolved = ok(await h.store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: SlugSchema.parse("planning") } }));
  const record = ok(await h.store.read({ reference: resolved.reference }));
  ok(await h.store.write({ ...recordPut(record, { links: { branches: [{ repository: "project", ref: "feat/planning", linkedAs: "created", excluded: [] }] } }),
    provenance: { verb: "link", lifecycleAction: "link" } }));
  expect((await probes.materializableWorkUnits()).candidates.map(item => item.name)).toEqual([]);
  h.repair();
  expect((await h.probes().materializableWorkUnits()).candidates.map(item => item.name)).toEqual(["demo", "planning"]);
});
