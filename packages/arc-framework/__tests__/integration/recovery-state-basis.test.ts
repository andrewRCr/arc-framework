/** Missing operational history rebuilds state without replacing code identity. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { resolveRecoveryStateBasis } from "../../src/lib/recover/state-basis.js";
import { CompactionSeedSchema } from "../../src/lib/compaction-seed/schema.js";
import { resolveTaskListCursor } from "../../src/lib/task-list/cursor.js";
import type { RecoveryLocusFrame } from "../../src/lib/recover/locus-context.js";
import type { Store } from "../../src/lib/store/contract.js";
import { StateVersionSchema } from "../../src/lib/store/identity.js";

const ok = <T>(value: T) => ({ ok: true as const, value });
const loadSet = { manifestVersion: 1 as const, entries: [{ path: ".arc/active/tasks-subject.md", readMode: { kind: "partial-strategic" as const } }] };
const cursor = resolveTaskListCursor("### `[ ]` **2.1 Continue**\n");
const frame: RecoveryLocusFrame = { kind: "resolved", subject: { kind: "work-unit", key: "subject" }, checkoutPath: "/repo",
  parentCheckoutPath: null, workflow: "process-task-loop", sessionType: "execution" };
const seed = () => CompactionSeedSchema.parse({ schemaVersion: 2, emittedAt: "2026-10-01T00:00:00Z", repoRoot: "/repo",
  branch: "feature/subject", head: "a".repeat(40), stateVersion: null, dirty: true, activeWorkUnit: "subject", metaPath: ".arc/active/meta-subject.md",
  sessionType: "execution", currentWorkflow: "process-task-loop", taskCursor: null, loadSet: { manifestVersion: 1, entries: [] },
  uncommittedFiles: ["src/code.ts"], locus: { checkoutPath: "/repo", parentCheckoutPath: null } });
const recover = { recoveryFrame: ok(frame), loadSet: ok(loadSet), taskCursor: ok(cursor) };
it.each(["null", "unresolvable"])("rebuilds a %s state version in memory while retaining original code evidence", async (kind) => {
  const h = createLifecycleHarness();
  await h.seedMeta("subject");
  const original = seed();
  const selected: Store = Object.create(h.store) as Store;
  if (kind === "unresolvable") {
    original.stateVersion = StateVersionSchema.parse("expired-state");
    selected.changes = () => Promise.resolve({ status: "refused", refusal: { code: "state-unresolvable", class: "recoverable", historyRefs: [],
      condition: "The saved state no longer resolves.", remedy: { text: "Rebuild from current state." } } });
  }
  const result = await resolveRecoveryStateBasis({ seed: original, recover, store: selected });
  expect(result.rebuilt).toBe(true);
  expect(result.seed).toEqual({ ...original, stateVersion: lifecycleSuccess(await h.store.version()), loadSet,
    taskCursor: cursor.status === "found" ? cursor.cursor : null });
  expect(original.taskCursor).toBeNull();
});
it("refuses to rebuild over a different work unit occupying the same checkout", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("other");
  await expect(resolveRecoveryStateBasis({ seed: seed(), recover: { ...recover, recoveryFrame: ok({ ...frame,
    subject: { kind: "work-unit", key: "other" } }) }, store: h.store })).rejects.toThrow("subject");
});
it("retains a resolving state baseline instead of silently adopting the current task", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("subject");
  const original = { ...seed(), stateVersion: lifecycleSuccess(await h.store.version()) };
  expect(await resolveRecoveryStateBasis({ seed: original, recover, store: h.store })).toEqual({ seed: original, rebuilt: false });
});
it("retains cursorless transient load-set evidence when rebuilding only its unavailable state anchor", async () => {
  const h = createLifecycleHarness();
  const original = { ...seed(), activeWorkUnit: null, metaPath: null, taskCursor: null, currentWorkflow: "run-errand", sessionType: null };
  const transient: RecoveryLocusFrame = { ...frame, workflow: "run-errand", sessionType: null, subject: { kind: "errand", key: "fix", claimId: "c".repeat(32) } };
  const result = await resolveRecoveryStateBasis({ seed: original, recover: { recoveryFrame: ok(transient), loadSet: ok(original.loadSet) }, store: h.store });
  expect(result).toEqual({ rebuilt: true, seed: { ...original, stateVersion: lifecycleSuccess(await h.store.version()) } });
});
