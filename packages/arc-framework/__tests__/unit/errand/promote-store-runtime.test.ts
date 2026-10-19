/** Store migration behavior through production store and runtime boundaries. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { TransientIdentityRecordV3Schema, projectLocusIdentity } from "../../../src/lib/errand/identity-record.js";
import { promoteOrdinaryErrandAtRuntime } from "../../../src/lib/errand/promote-runtime.js";
import { writeWorktreeMarker, readWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { createStoreSyncPort } from "../../../src/lib/store/operational-sync.js";
import { readStoreIdentityEvidence, projectStoreIdentityDiscovery } from "../../../src/lib/locus/store-identities.js";
import { DerivedLocusFrameSchema, DerivedCheckoutRowSchema } from "../../../src/lib/locus/derived-schema.js";
import type { DerivedLocusFrame } from "../../../src/lib/locus/derived-reader.js";
import { makeGitProcessError } from "../../helpers/git-exec-fake.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function fixture() {
  const h = createLifecycleHarness(), cwd = await mkdtemp(join(tmpdir(), "arc-promote-store-runtime-")); dirs.push(cwd); h.store.environment.identity = "alice";
  const sha = "a".repeat(40), claimId = "b".repeat(32);
  const source = TransientIdentityRecordV3Schema.parse({ version: 3, slug: "fix-it", claimId, createdAt: "2026-10-15T00:00:00Z", updatedAt: "2026-10-15T00:00:00Z",
    kind: "errand", purpose: "errand", intent: "Fix", owner: "alice", branch: "chore/fix-it", origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null });
  const primary = await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "fix-it" })), JSON.stringify(source), { kind: "active" },
    { branches: [{ repository: "project", ref: "chore/fix-it", linkedAs: "created", excluded: [] }] });
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "alice", createdAt: source.createdAt,
    createdFor: { kind: "errand", slug: source.slug, claimId }, provisioning: "ready" });
  const identity = projectLocusIdentity(source);
  const row = DerivedCheckoutRowSchema.parse({ kind: "transient", checkout: { path: cwd, head: sha, branch: "chore/fix-it", detached: false, folderPresent: true, primary: true },
    markerGeneration: "generation", parentCheckoutPath: null, origin: null, identity, context: null, lifecycleLocation: null, diagnostics: [],
    subject: { kind: "errand", key: source.slug, claimId } });
  const frame = DerivedLocusFrameSchema.parse({ roster: [row], entering: { kind: "selected", row }, primaryAvailability: { kind: "occupied", checkoutPath: cwd, subject: row.subject },
    identityDiscovery: projectStoreIdentityDiscovery(await readStoreIdentityEvidence(h.store, "alice"), [row]), active: null });
  const calls: { args: readonly string[]; cwd: string | undefined }[] = []; let branchCut = false;
  const exec: GitExec = async (command, args, options) => {
    calls.push({ args, cwd: options?.cwd });
    if (args[0] === "check-ref-format") return { stdout: "", stderr: "" };
    if (args.includes("rev-parse")) {
      if (args.at(-1)?.includes("feat/grown") && !branchCut) throw makeGitProcessError({ command, args, exitCode: 1 });
      return { stdout: sha, stderr: "" };
    }
    if (args[0] === "branch") branchCut = true;
    return { stdout: "", stderr: "" };
  };
  const write = vi.fn(async () => ({ kind: "replaced" as const, bytes: Buffer.from("anchored") }));
  const options = { store: h.store, projectId: async () => "project", exec, execInput: async () => "",
    slug: "fix-it", name: "grown", type: "feat", floor: "derivation" as const, owner: "alice", identity: "alice", protection: "full" as const, base: "main",
    readFrame: async () => frame, settleInbox: vi.fn(async () => ({ kind: "idempotent" as const })),
    locusPorts: { checkMarkerExclusivity: vi.fn(async () => ({ kind: "clear" as const })), findHoldingCheckout: async () => cwd, writeAnchoredMarker: write } };
  return { ...h, options, frame, primary, calls, cwd, write };
}
it("selects store steps, runs Git at the authority checkout and atomically replaces the primary marker", async () => {
  const f = await fixture();
  expect(await promoteOrdinaryErrandAtRuntime(f.options)).toMatchObject({ outcome: "applied", checkoutPath: f.cwd, settlement: { originEntry: null } });
  expect(f.options.settleInbox).not.toHaveBeenCalled();
  expect(f.calls.every((call) => call.cwd === f.cwd)).toBe(true);
  expect(f.write).toHaveBeenCalledWith(f.cwd, expect.objectContaining({ spawnedByArc: false, wuName: "grown" }), expect.objectContaining({ expected: expect.any(Buffer) }));
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference })).reference.kind).toBe("work-item/meta");
});
it("refuses exclusivity and missing project identity before role writes or Git", async () => {
  const f = await fixture();
  const blocked = { ...f.options, locusPorts: { ...f.options.locusPorts,
    checkMarkerExclusivity: async () => ({ kind: "refused" as const, reason: "Held elsewhere" }) } };
  expect(await promoteOrdinaryErrandAtRuntime(blocked)).toMatchObject({ outcome: "refused", recommendedPromptText: "Held elsewhere" });
  expect(f.calls).toEqual([]);
  expect(await promoteOrdinaryErrandAtRuntime({ ...f.options, projectId: undefined })).toMatchObject({ outcome: "refused", recommendedPromptText: expect.stringContaining("identity") });
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference })).version).toBe(f.primary.version);
});
it("preserves foreign-generation confirmation without cutting a branch", async () => {
  const f = await fixture();
  const other = { ...f.frame.entering, row: { ...f.frame.roster[0]!, checkout: { ...f.frame.roster[0]!.checkout, path: "/other" } } } as DerivedLocusFrame["entering"];
  expect(await promoteOrdinaryErrandAtRuntime({ ...f.options, readFrame: async () => ({ ...f.frame, entering: other }) })).toMatchObject({ outcome: "confirmation-required" });
  expect(f.calls).toEqual([]);
});
it("refuses an unreachable authority pull without mutation and retries through the repaired port", async () => {
  const f = await fixture(), before = lifecycleSuccess(await f.store.version()), marker = await readWorktreeMarker(f.cwd);
  let reachable = false;
  const sync = createStoreSyncPort({ pull: async () => reachable ? { status: "pulled" }
    : { status: "unreachable", condition: "Origin is offline.", remedy: { text: "Reconnect to origin and retry promotion." } } });
  const options = { ...f.options, sync };
  expect(await promoteOrdinaryErrandAtRuntime(options)).toMatchObject({ outcome: "refused", reason: "authority-unresolved",
    recommendedPromptText: "Origin is offline. Reconnect to origin and retry promotion." });
  expect(lifecycleSuccess(await f.store.version())).toBe(before);
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference }))).toEqual(f.primary);
  expect(await readWorktreeMarker(f.cwd)).toEqual(marker);
  expect(f.calls).toEqual([]);
  reachable = true;
  expect(await promoteOrdinaryErrandAtRuntime(options)).toMatchObject({ outcome: "applied", checkoutPath: f.cwd });
});
it("pulls the project identity and source owner before acquiring promotion authority", async () => {
  const f = await fixture(), repository = "00000000-0000-4000-8000-000000000001";
  const source = TransientIdentityRecordV3Schema.parse(JSON.parse(f.primary.content));
  if (source.kind !== "errand" || source.purpose !== "errand") throw new Error("Missing ordinary source");
  lifecycleSuccess(await f.store.write({ action: "put", reference: f.primary.reference, expected: f.primary.version,
    content: JSON.stringify({ ...source, owner: "bob" }), placement: { kind: "active" },
    links: { branches: [{ repository, ref: "chore/fix-it", linkedAs: "created", excluded: [] }] }, provenance: { verb: "update-owner", lifecycleAction: "update" } }));
  const sync = createStoreSyncPort({ pull: async () => {
    await f.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "pulled-project", uid: repository })), "{}");
    const current = lifecycleSuccess(await f.store.read({ reference: f.primary.reference }));
    lifecycleSuccess(await f.store.write({ action: "put", reference: current.reference, expected: current.version,
      content: JSON.stringify(source), placement: { kind: "active" }, links: current.links, provenance: { verb: "pull-owner", lifecycleAction: "update" } }));
    return { status: "pulled" };
  } });
  expect(await promoteOrdinaryErrandAtRuntime({ ...f.options, projectId: undefined, sync })).toMatchObject({ outcome: "applied" });
  const meta = lifecycleSuccess(await f.store.read({ reference: f.primary.reference }));
  expect(meta.reference.kind).toBe("work-item/meta");
  expect(meta.fields).toMatchObject({ owner: "alice" });
  expect(meta.links?.branches).toContainEqual({ repository, ref: "feat/grown", linkedAs: "created", excluded: [] });
});
