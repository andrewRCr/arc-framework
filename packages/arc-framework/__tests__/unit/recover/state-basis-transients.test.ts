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
