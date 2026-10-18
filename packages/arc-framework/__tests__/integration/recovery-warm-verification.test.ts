/** Registered recovery retains a verification parent's cursorless context inside a warm Errand. */
import { expect, it, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Store } from "../../src/lib/store/contract.js";
const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});
import { makeUnclosedTaskFixture } from "../helpers/unclosed-task-commits.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { recordReferences, OwnerIdentitySchema } from "../../src/lib/store/identity.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { SessionRecoverProbeResultSchema } from "../../src/commands/status/schema.js";
import { emitCompactionSeed } from "../../src/lib/compaction-seed/emitter.js";
import { resolveRecoveryStateBasis } from "../../src/lib/recover/state-basis.js";
import { auditRecoveryState } from "../../src/lib/recover/audit.js";

it("emits a valid warm recovery envelope and audits its rebuilt cursorless state", async () => {
  const h = await makeUnclosedTaskFixture({ tasks: "# Task List: demo\n\n### `[x]` **1.1 Complete**\n" });
  const project = randomUUID(), slug = "verification-child", branch = `chore/${slug}`, claimId = "c".repeat(32), child = join(h.cwd, "child");
  await h.git(["config", "arc.identity", "test-user"]);
  await h.git(["config", "arc.role", "maintainer"]);
  await mkdir(join(h.cwd, ".arc/system"), { recursive: true });
  await writeFile(join(h.cwd, ".arc/system/arc-config.yml"), "branch.base: main\nsession.remote_sync: disabled\n");
  await h.git(["add", ".arc/system/arc-config.yml"]); await h.git(["commit", "-m", "Recovery configuration"]);
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "recovery-project", uid: project })), "{}");
  await h.putLinks({ branches: [{ repository: project, ref: "feat/demo", linkedAs: "created", excluded: [] }] });
  await ensureWorktreeMarkerIgnored(h.cwd, h.input.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(h.cwd, { spawnedByArc: false, spawningIdentity: "test-user", createdAt: "2026-10-18T00:00:00Z",
    createdFor: { kind: "work-unit", name: "demo" } });
  await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: slug })), JSON.stringify({
    version: 3, kind: "errand", purpose: "errand", slug, branch, claimId, owner: "test-user", createdAt: "2026-10-18T00:00:00Z",
    updatedAt: "2026-10-18T00:00:00Z", state: "open", changeRequest: null, savedHead: null, intent: "Verify recovery", origin: "description", originEntry: null,
  }), { kind: "active" }, { branches: [{ repository: project, ref: branch, linkedAs: "created", excluded: [] }] });
  await h.git(["worktree", "add", "-b", branch, child]);
  await ensureWorktreeMarkerIgnored(child, h.input.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(child, { spawnedByArc: true, spawningIdentity: "test-user", createdAt: "2026-10-18T00:00:00Z",
    createdFor: { kind: "errand", slug, claimId }, provisioning: "ready", parentCheckoutPath: h.cwd });
  const originalCwd = process.cwd(), originalExit = process.exitCode;
  let output = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    binding.store = h.store; process.chdir(child); process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", "status", "--recover", "--json"]);
    const recover = SessionRecoverProbeResultSchema.parse(JSON.parse(output));
    expect(recover).toMatchObject({ recoveryFrame: { ok: true, value: { workflow: "run-errand", sessionType: "execution", parentCheckoutPath: h.cwd } },
      taskCursor: { ok: true, value: { status: "no-open-task" } } });
    expect(process.exitCode).toBeUndefined();
    const head = await h.git(["rev-parse", "HEAD"]), ok = <T>(value: T) => ({ ok: true as const, value });
    const emitted = await emitCompactionSeed({ cwd: child, stateVersion: null, writeSeed: async () => {},
      gitSnapshot: { branch, head, uncommittedFiles: [] }, envelope: { identity: recover.identity, derivedLocusState: recover.derivedLocusState,
        worktree: ok({ branch, identity: { kind: "linked", path: child } }), active: ok({ path: null, sessionType: null, currentWorkflow: null }),
        loadSet: recover.loadSet, taskCursor: recover.taskCursor } });
    if (emitted.status !== "written") throw new Error(JSON.stringify(emitted));
    const basis = await resolveRecoveryStateBasis({ seed: emitted.seed, recover, store: h.store });
    expect(basis.seed.stateVersion).toBe(lifecycleSuccess(await h.store.version()));
    expect(basis.seed).toMatchObject({ currentWorkflow: "run-errand", taskCursor: null, activeWorkUnit: "demo" });
    expect(await auditRecoveryState({ seed: basis.seed, recover, freshBranch: branch, freshHead: head, freshRepoRoot: child,
      freshUncommittedFiles: [], resolveCommittedProgress: async () => ({ advanced: false, files: new Set<string>() }) }))
      .toMatchObject({ status: "ready", taskCursor: null });
  } finally { stdout.mockRestore(); binding.store = null; process.chdir(originalCwd); process.exitCode = originalExit; }
}, 30_000);
