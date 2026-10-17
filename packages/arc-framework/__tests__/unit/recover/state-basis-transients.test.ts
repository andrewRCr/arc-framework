/** Unavailable state anchors rebuild warm transient context without changing its checkout identity. */
import { expect, it } from "vitest";
import { emitCompactionSeed } from "../../../src/lib/compaction-seed/emitter.js";
import { resolveRecoveryStateBasis } from "../../../src/lib/recover/state-basis.js";
import { deriveRecoveryLocusContext } from "../../../src/lib/recover/locus-context.js";
import { resolveLoadSetManifest } from "../../../src/lib/load-set/projection.js";
import { DerivedLocusFrameSchema } from "../../../src/lib/locus/derived-schema.js";
import { LocusIdentityV1Schema } from "../../../src/lib/locus/schema/identity.js";
import { resolveTaskListCursor } from "../../../src/lib/task-list/cursor.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import type { Store } from "../../../src/lib/store/contract.js";
import { auditRecoveryState } from "../../../src/lib/recover/audit.js";

const ok = <T>(value: T) => ({ ok: true as const, value });
const cursor = resolveTaskListCursor("### `[ ]` **2.1 Continue**\n");
function transientState(kind: "errand" | "groom" | "housekeep", parentName = "subject", warm = true) {
  const loadSet = resolveLoadSetManifest({ identity: "andrew", stateOffBranch: true, activeWorkUnit: parentName,
    metaPath: `.arc/active/meta-${parentName}.md`, sessionType: "execution", planningStage: null,
    taskListPath: `.arc/active/tasks-${parentName}.md`, cohortDocPath: null });
  const common = { markerGeneration: "generation", origin: null, identity: null, context: null, diagnostics: [], lifecycleLocation: null };
  const checkout = { path: "/parent", head: "a".repeat(40), branch: "feat/subject", detached: false, primary: true, folderPresent: true };
  const parent = { ...common, checkout, kind: "work-unit", parentCheckoutPath: null, subject: { kind: "work-unit", key: parentName },
    context: { kind: "resolved", metaPath: `.arc/active/meta-${parentName}.md`, owner: "andrew", branch: "feat/subject", sessionType: "execution",
      workflow: "process-task-loop", stage: null, taskListPath: `.arc/active/tasks-${parentName}.md`, taskCursor: cursor,
      cohortDocPath: null, loadSet, integrationBoundary: null } };
  const key = kind === "groom" ? "groom-stub" : "fix", claimId = "c".repeat(32), branch = kind === "groom" ? "plan/groom-stub" : "errand/fix";
  const identity = LocusIdentityV1Schema.parse({ kind: kind === "groom" ? "groom" : "errand", key, claimId, protection: "full", branch,
    state: "open", savedHead: null, changeRequest: null,
    ...(kind === "groom" ? { purpose: null, anchorStub: "stub", members: ["stub"], openedBaseHead: "a".repeat(40) }
      : kind === "housekeep" ? { purpose: "housekeep-routing" } : { purpose: "errand", origin: "description", originEntry: null }) });
  const entering = { ...common, kind: "transient", checkout: { ...checkout, path: "/child", branch, primary: false }, identity,
    parentCheckoutPath: warm ? "/parent" : null, subject: { kind, key, claimId } };
  return DerivedLocusFrameSchema.parse({ roster: [entering, ...(warm ? [parent] : [])], entering: { kind: "selected", row: entering },
    primaryAvailability: { kind: "occupied", checkoutPath: "/parent", subject: parent.subject }, identityDiscovery: { kind: "absent" }, active: null });
}
async function emitted(kind: "errand" | "groom" | "housekeep", anchor: "null" | "expired", warm = true) {
  const h = createLifecycleHarness(); await h.seedMeta("subject");
  const state = transientState(kind, "subject", warm), recovery = deriveRecoveryLocusContext({ state, identity: "andrew", workingMemoryPath: null });
  const selected: Store = Object.create(h.store) as Store;
  const missing = { code: "state-unresolvable" as const, class: "recoverable" as const, historyRefs: [], condition: "History expired.", remedy: { text: "Rebuild current state." } };
  const result = await emitCompactionSeed({ cwd: "/child", envelope: { identity: { identity: "andrew" }, derivedLocusState: ok(state),
    worktree: ok({ branch: "errand/fix", identity: { kind: "linked", path: "/child" } }), active: ok({ path: null, sessionType: null, currentWorkflow: null }),
    loadSet: ok(recovery.loadSet), taskCursor: ok(cursor) }, gitSnapshot: { branch: "errand/fix", head: "a".repeat(40), uncommittedFiles: ["src/code.ts"] },
    store: anchor === "null" ? { version: async () => ({ status: "refused", refusal: missing }) } : h.store, writeSeed: async () => {} });
  if (result.status !== "written") throw new Error(JSON.stringify(result));
  if (anchor === "expired") selected.changes = async () => ({ status: "refused", refusal: missing });
  const recover = { recoveryFrame: ok(recovery.frame), loadSet: ok(recovery.loadSet), taskCursor: recovery.taskCursor === null ? undefined : ok(recovery.taskCursor) };
  return { ...h, original: result.seed, selected, recover };
}

it.each((["errand", "groom", "housekeep"] as const).flatMap(kind => (["null", "expired"] as const).map(anchor => ({ kind, anchor }))))(
  "rebuilds a $anchor anchor for a warm $kind emitted with inherited parent context", async ({ kind, anchor }) => {
    const h = await emitted(kind, anchor);
    expect(h.original).toMatchObject({ activeWorkUnit: "subject", metaPath: ".arc/active/meta-subject.md", locus: { checkoutPath: "/child", parentCheckoutPath: "/parent" } });
    const result = await resolveRecoveryStateBasis({ seed: h.original, recover: h.recover, store: h.selected });
    expect(result).toEqual({ rebuilt: true, seed: { ...h.original, stateVersion: lifecycleSuccess(await h.store.version()) } });
});
it.each(["checkout", "parent", "work-unit"] as const)("refuses a changed warm transient %s basis", async changed => {
  const h = await emitted("errand", "null");
  const frame = h.recover.recoveryFrame.value;
  if (frame.kind !== "resolved") throw new Error("Expected a transient recovery frame");
  const other = deriveRecoveryLocusContext({ state: transientState("errand", "other"), identity: "andrew", workingMemoryPath: null });
  const recover = changed === "work-unit" ? { ...h.recover, loadSet: ok(other.loadSet) } : { ...h.recover,
    recoveryFrame: ok({ ...frame, ...(changed === "checkout" ? { checkoutPath: "/other" } : { parentCheckoutPath: "/other" }) }) };
  await expect(resolveRecoveryStateBasis({ seed: h.original, recover, store: h.selected })).rejects.toThrow(/checkout|subject/iu);
});

it.each(["null", "expired"] as const)("keeps a %s no-work-unit seed from adopting a new work unit", async anchor => {
  const h = createLifecycleHarness(); await h.seedMeta("other", { state: "Planning", currentWorkflow: "draft-design" });
  const head = "a".repeat(40), checkout = { path: "/repo", head, branch: "main", detached: false, primary: true, folderPresent: true };
  const common = { checkout, markerGeneration: null, parentCheckoutPath: null, origin: null, identity: null, context: null, diagnostics: [], lifecycleLocation: null };
  const free = { ...common, kind: "free-primary", subject: null };
  const originalState = DerivedLocusFrameSchema.parse({ roster: [free], entering: { kind: "selected", row: free },
    primaryAvailability: { kind: "free", checkoutPath: checkout.path }, identityDiscovery: { kind: "absent" }, active: null });
  const context = (state: typeof originalState) => deriveRecoveryLocusContext({ state, identity: "andrew", workingMemoryPath: null });
  const originalContext = context(originalState);
  const emitted = await emitCompactionSeed({ cwd: checkout.path, stateVersion: anchor === "null" ? null : lifecycleSuccess(await h.store.version()),
    envelope: { identity: { identity: "andrew" }, derivedLocusState: ok(originalState),
      worktree: ok({ branch: "main", identity: { kind: "primary" } }), active: ok({ path: null, sessionType: null, currentWorkflow: null }),
      loadSet: ok(originalContext.loadSet) }, gitSnapshot: { branch: "main", head, uncommittedFiles: [] }, writeSeed: async () => {} });
  if (emitted.status !== "written") throw new Error(JSON.stringify(emitted));
  const selected = Object.create(h.store) as Store;
  if (anchor === "expired") selected.changes = async () => ({ status: "refused", refusal: { code: "state-unresolvable", class: "recoverable",
    historyRefs: [], condition: "History expired.", remedy: { text: "Rebuild current state." } } });
  const loadSet = resolveLoadSetManifest({ identity: "andrew", stateOffBranch: true, activeWorkUnit: "other", metaPath: ".arc/active/meta-other.md",
    sessionType: "planning", planningStage: "draft-design", taskListPath: null, cohortDocPath: null });
  const held = { ...common, kind: "work-unit", subject: { kind: "work-unit", key: "other" }, markerGeneration: "generation", lifecycleLocation: "active",
    context: { kind: "resolved", metaPath: ".arc/active/meta-other.md", owner: "andrew", branch: null, sessionType: "planning", workflow: "planning",
      stage: "draft-design", taskListPath: null, taskCursor: null, cohortDocPath: null, loadSet, integrationBoundary: null } };
  const changedState = DerivedLocusFrameSchema.parse({ roster: [held], entering: { kind: "selected", row: held }, identityDiscovery: { kind: "absent" },
    primaryAvailability: { kind: "occupied", checkoutPath: checkout.path, subject: held.subject },
    active: { checkoutPath: checkout.path, subject: held.subject, context: held.context } });
  const probe = (state: typeof originalState) => { const fresh = context(state); return { derivedLocusState: ok(state), recoveryFrame: ok(fresh.frame),
    loadSet: ok(fresh.loadSet), dirty: ok({ state: "clean" as const, fileCount: 0 }) }; };
  await expect(resolveRecoveryStateBasis({ seed: emitted.seed, recover: probe(changedState), store: selected })).rejects.toThrow(/fresh ARC session/iu);
  const restored = probe(originalState), rebuilt = await resolveRecoveryStateBasis({ seed: emitted.seed, recover: restored, store: selected });
  expect(rebuilt.seed).toEqual({ ...emitted.seed, stateVersion: lifecycleSuccess(await h.store.version()) });
  expect(await auditRecoveryState({ seed: rebuilt.seed, recover: restored, freshBranch: "main", freshHead: head, freshRepoRoot: checkout.path,
    freshUncommittedFiles: [], resolveCommittedProgress: async () => ({ advanced: false, files: new Set<string>() }) })).toMatchObject({ status: "ready" });
});

it.each((["errand", "groom", "housekeep"] as const).flatMap(kind => (["null", "expired"] as const).map(anchor => ({ kind, anchor }))))(
  "keeps a $anchor no-work-unit $kind seed from inheriting a replacement parent", async ({ kind, anchor }) => {
    const h = createLifecycleHarness(), warm = transientState(kind);
    const parent = warm.roster.find(row => row.checkout.primary);
    if (parent === undefined || warm.entering.kind !== "selected") throw new Error("Missing fixture parent/child");
    const originalState = DerivedLocusFrameSchema.parse({ ...warm,
      roster: [warm.entering.row, { ...parent, kind: "unresolved-checkout", context: null,
        diagnostics: [{ source: "lifecycle", code: "work-unit-record-missing", message: "Parent record is missing." }] }],
      primaryAvailability: { kind: "unsafe", checkoutPath: "/parent", reasons: ["work-unit-record-missing"] } });
    const probe = (state: typeof originalState) => {
      const context = deriveRecoveryLocusContext({ state, identity: "andrew", workingMemoryPath: null });
      return { derivedLocusState: ok(state), recoveryFrame: ok(context.frame), loadSet: ok(context.loadSet),
        ...(context.taskCursor === null ? {} : { taskCursor: ok(context.taskCursor) }), dirty: ok({ state: "clean" as const, fileCount: 0 }) };
    };
    const original = probe(originalState), checkout = warm.entering.row.checkout;
    const emitted = await emitCompactionSeed({ cwd: checkout.path,
      stateVersion: anchor === "null" ? null : lifecycleSuccess(await h.store.version()),
      envelope: { identity: { identity: "andrew" }, derivedLocusState: original.derivedLocusState,
        worktree: ok({ branch: checkout.branch!, identity: { kind: "linked", path: checkout.path } }),
        active: ok({ path: null, sessionType: null, currentWorkflow: null }), loadSet: original.loadSet },
      gitSnapshot: { branch: checkout.branch!, head: checkout.head, uncommittedFiles: [] }, writeSeed: async () => {} });
    if (emitted.status !== "written") throw new Error(JSON.stringify(emitted));
    expect(emitted.seed).toMatchObject({ activeWorkUnit: null, metaPath: null, locus: { parentCheckoutPath: "/parent" } });
    await h.seedMeta("other");
    const selected = Object.create(h.store) as Store;
    if (anchor === "expired") selected.changes = async () => ({ status: "refused", refusal: { code: "state-unresolvable", class: "recoverable",
      historyRefs: [], condition: "History expired.", remedy: { text: "Rebuild current state." } } });
    await expect(resolveRecoveryStateBasis({ seed: emitted.seed, recover: probe(transientState(kind, "other")), store: selected }))
      .rejects.toThrow(/fresh ARC session/iu);
    const rebuilt = await resolveRecoveryStateBasis({ seed: emitted.seed, recover: original, store: selected });
    expect(rebuilt.seed).toEqual({ ...emitted.seed, stateVersion: lifecycleSuccess(await h.store.version()) });
    expect(await auditRecoveryState({ seed: rebuilt.seed, recover: original, freshBranch: checkout.branch!, freshHead: checkout.head,
      freshRepoRoot: checkout.path, freshUncommittedFiles: [], resolveCommittedProgress: async () => ({ advanced: false, files: new Set<string>() }) }))
      .toMatchObject({ status: "ready" });
  });
