/** Recovery exposes actual close evidence beside a matching cursor and preserves cursor stops. */
import { expect, it } from "vitest";
import { makeUnclosedTaskFixture, unclosedTaskList } from "../helpers/unclosed-task-commits.js";
import { runDerivedLocusStateProbe } from "../../src/handlers/derived-locus-state-probe.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { emitCompactionSeed, parseUncommittedFiles } from "../../src/lib/compaction-seed/emitter.js";
import { deriveRecoveryLocusContext } from "../../src/lib/recover/locus-context.js";
import { auditRecoveryState, RecoveryAuditVerdictSchema } from "../../src/lib/recover/audit.js";
import { resolveCommittedProgress } from "../../src/lib/recover/committed-progress.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";

const ok = <T>(value: T) => ({ ok: true as const, value });
async function fixture() {
  const h = await makeUnclosedTaskFixture();
  await writeWorktreeMarker(h.cwd, { spawnedByArc: false, spawningIdentity: "test-user", createdAt: "2026-10-16T00:00:00Z",
    createdFor: { kind: "work-unit", name: "demo" } });
  const exec: typeof h.input.exec = (command, args, options) => h.input.exec(command, args, { ...options, cwd: h.cwd });
  const frame = () => runDerivedLocusStateProbe({ ...h.input, exec, identity: "test-user", archiveCadence: "manual" });
  const initial = await frame();
  if (initial.entering.kind === "selected" && initial.entering.row.kind === "unresolved-checkout") throw new Error(JSON.stringify(initial.entering.row.diagnostics));
  const context = deriveRecoveryLocusContext({ state: initial, identity: "test-user", workingMemoryPath: null });
  const status = async () => parseUncommittedFiles((await exec("git", ["status", "--porcelain=v1", "-z"])).stdout);
  const emitted = await emitCompactionSeed({ cwd: h.cwd, store: h.store, exec, writeSeed: () => Promise.resolve(),
    gitSnapshot: { branch: "feat/demo", head: await h.git(["rev-parse", "HEAD"]), uncommittedFiles: await status() },
    envelope: { identity: { identity: "test-user" }, derivedLocusState: ok(initial), worktree: ok({ branch: "feat/demo", identity: { kind: "primary" } }),
      active: ok({ path: initial.active?.context.metaPath ?? null, sessionType: "execution", currentWorkflow: "process-task-loop" }), loadSet: ok(context.loadSet),
      ...(context.taskCursor === null ? {} : { taskCursor: ok(context.taskCursor) }) } });
  if (emitted.status !== "written") throw new Error(`The actual compaction seed did not emit: ${JSON.stringify(emitted)}`);
  const sha = await h.commit("uncaptured task work\n");
  const audit = async () => {
    const derived = await frame();
    const fresh = deriveRecoveryLocusContext({ state: derived, identity: "test-user", workingMemoryPath: null });
    const files = await status();
    return auditRecoveryState({ seed: emitted.seed, freshBranch: "feat/demo", freshHead: await h.git(["rev-parse", "HEAD"]),
      freshRepoRoot: h.cwd, freshUncommittedFiles: files,
      resolveCommittedProgress: (seedHead, currentHead) => resolveCommittedProgress({ exec, cwd: h.cwd, seedHead, currentHead }),
      recover: { derivedLocusState: ok(derived), recoveryFrame: ok(fresh.frame), loadSet: ok(fresh.loadSet),
        dirty: ok(files.length === 0 ? { state: "clean", fileCount: 0 } : { state: "dirty", fileCount: files.length }),
        ...(fresh.taskCursor === null ? {} : { taskCursor: ok(fresh.taskCursor) }) } });
  };
  return { ...h, sha, audit };
}
it("lists a landed open-task commit with the same close action beside the matching recovery cursor", async () => {
  const h = await fixture();
  const verdict = await h.audit();
  expect(verdict).toMatchObject({ status: "ready", taskCursor: { match: true },
    unclosedTaskCommits: { status: "available", commits: [{ sha: h.sha }],
      actions: [{ text: "arc task close", argv: ["arc", "task", "close"], checkout: h.cwd }] } });
  expect(verdict.explainedDrift).toContainEqual(expect.objectContaining({ kind: "head-advanced" }));
  expect(RecoveryAuditVerdictSchema.safeParse(verdict).success).toBe(true);
});
it("keeps the existing stop for a mismatched cursor", async () => {
  const h = await fixture();
  lifecycleSuccess(await h.store.write({ action: "put", reference: h.tasks.reference, expected: h.tasks.version,
    content: unclosedTaskList.replace("[ ]` **1.1.a", "[x]` **1.1.a"), provenance: { verb: "task-close", lifecycleAction: "update" } }));
  const verdict = await h.audit();
  expect(verdict.status).toBe("stop");
  expect(verdict.stopReasons).toContainEqual(expect.objectContaining({ kind: "task-cursor-mismatch" }));
  expect(verdict).not.toHaveProperty("unclosedTaskCommits");
});
