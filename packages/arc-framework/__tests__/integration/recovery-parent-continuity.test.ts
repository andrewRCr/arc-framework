/** Recovery retains a no-work-unit baseline across changes in its transient's real parent checkout. */
import { expect, it, onTestFinished } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess as ok } from "../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, writeWorktreeMarker,
  readWorktreeMarkerGeneration, removeWorktreeMarkerGeneration } from "../../src/lib/git/worktree-marker.js";
import { runDerivedLocusStateProbe } from "../../src/handlers/derived-locus-state-probe.js";
import { deriveRecoveryLocusContext } from "../../src/lib/recover/locus-context.js";
import { emitCompactionSeed } from "../../src/lib/compaction-seed/emitter.js";
import { resolveRecoveryStateBasis } from "../../src/lib/recover/state-basis.js";
import { auditRecoveryState } from "../../src/lib/recover/audit.js";
import type { Store } from "../../src/lib/store/contract.js";
const result = <T>(value: T) => ({ ok: true as const, value });

it("refuses an inherited replacement parent for unavailable anchors and recovers after restoring its original context", async () => {
  const cwd = await createTempRepo(); onTestFinished(() => cleanupTempDir(cwd));
  const exec = makeGitExec(cwd), h = createLifecycleHarness(), project = randomUUID();
  await exec("git", ["config", "arc.identity", "test-user"]);
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\nbranch.protection: full\nteam.mode: false\nsession.remote_sync: disabled\n");
  await exec("git", ["add", "."]); await exec("git", ["commit", "-m", "Initial recovery fixture"]);
  const head = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "recovery-project", uid: project })), "{}");
  const original = await h.seedMeta("original-parent", { state: "Planning", currentWorkflow: "draft-design" });
  await ensureWorktreeMarkerIgnored(cwd, exec, nodeWorktreeMarkerIgnoreFs);
  const parentMarker = (name: string) => ({ spawnedByArc: false, spawningIdentity: "test-user", createdAt: "2026-10-17T00:00:00Z",
    createdFor: { kind: "work-unit" as const, name } });
  await writeWorktreeMarker(cwd, parentMarker("original-parent"));
  const slug = "recovery-child", branch = `chore/${slug}`, claimId = "d".repeat(32), child = join(cwd, ".arc-checkouts", slug);
  await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: slug })), JSON.stringify({
    version: 3, kind: "errand", purpose: "errand", slug, branch, claimId, owner: "test-user", createdAt: "2026-10-17T00:00:00Z",
    updatedAt: "2026-10-17T00:00:00Z", state: "open", changeRequest: null, savedHead: null, intent: "Recovery fixture", origin: "description", originEntry: null,
  }), { kind: "active" }, { branches: [{ repository: project, ref: branch, linkedAs: "created", excluded: [] }] });
  await exec("git", ["worktree", "add", "-b", branch, child]);
  await ensureWorktreeMarkerIgnored(child, exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(child, { spawnedByArc: true, spawningIdentity: "test-user", createdAt: "2026-10-17T00:00:00Z",
    createdFor: { kind: "errand", slug, claimId }, provisioning: "ready", parentCheckoutPath: cwd });
  const probe = async () => {
    const state = await runDerivedLocusStateProbe({ cwd: child, exec, store: h.store, identity: "test-user", baseBranch: "main" });
    const context = deriveRecoveryLocusContext({ state, identity: "test-user", workingMemoryPath: null });
    return { derivedLocusState: result(state), recoveryFrame: result(context.frame), loadSet: result(context.loadSet),
      dirty: result({ state: "clean" as const, fileCount: 0 }) };
  };
  expect((await probe()).loadSet.value.entries.some(entry => entry.path.endsWith("meta-original-parent.md"))).toBe(true);
  ok(await h.store.write({ action: "remove", reference: original.reference, expected: original.version,
    provenance: { verb: "abandon", lifecycleAction: "transition" } }));
  const absent = await probe(), seeds = [];
  expect(absent.loadSet.value.entries.some(entry => entry.path.includes("meta-"))).toBe(false);
  for (const anchor of ["null", "expired"] as const) {
    const emitted = await emitCompactionSeed({ cwd: child, stateVersion: anchor === "null" ? null : ok(await h.store.version()),
      envelope: { identity: { identity: "test-user" }, derivedLocusState: absent.derivedLocusState,
        worktree: result({ branch, identity: { kind: "linked", path: child } }), active: result({ path: null, sessionType: null, currentWorkflow: null }),
        loadSet: absent.loadSet }, gitSnapshot: { branch, head, uncommittedFiles: [] }, writeSeed: async () => {} });
    if (emitted.status !== "written") throw new Error(JSON.stringify(emitted));
    expect(emitted.seed).toMatchObject({ activeWorkUnit: null, metaPath: null, locus: { parentCheckoutPath: cwd } });
    const selected = Object.create(h.store) as Store;
    if (anchor === "expired") selected.changes = async () => ({ status: "refused", refusal: { code: "state-unresolvable", class: "recoverable",
      historyRefs: [], condition: "The saved state is unavailable.", remedy: { text: "Rebuild current state." } } });
    seeds.push({ seed: emitted.seed, store: selected });
  }
  const replaceParent = async (name: string) => {
    const marker = await readWorktreeMarkerGeneration(cwd);
    if (marker.kind !== "present") throw new Error("Missing parent marker");
    expect(await removeWorktreeMarkerGeneration(cwd, marker.bytes)).toEqual({ kind: "removed" });
    await writeWorktreeMarker(cwd, parentMarker(name));
  };
  await h.seedMeta("replacement-parent", { state: "Planning", currentWorkflow: "draft-design" });
  await replaceParent("replacement-parent");
  const changed = await probe();
  expect(changed.loadSet.value.entries.some(entry => entry.path.endsWith("meta-replacement-parent.md"))).toBe(true);
  expect((await exec("git", ["status", "--porcelain"], { cwd: child })).stdout).toBe("");
  expect((await exec("git", ["rev-parse", "HEAD"], { cwd: child })).stdout.trim()).toBe(head);
  for (const { seed, store } of seeds) {
    await expect(resolveRecoveryStateBasis({ seed, recover: changed, store })).rejects.toThrow(/fresh ARC session/iu);
    expect(seed.loadSet).toEqual(absent.loadSet.value);
  }
  await replaceParent("original-parent");
  const restored = await probe();
  for (const { seed, store } of seeds) {
    const rebuilt = await resolveRecoveryStateBasis({ seed, recover: restored, store });
    expect(rebuilt.seed).toEqual({ ...seed, stateVersion: ok(await h.store.version()) });
    expect(await auditRecoveryState({ seed: rebuilt.seed, recover: restored, freshBranch: branch, freshHead: head,
      freshRepoRoot: child, freshUncommittedFiles: [], resolveCommittedProgress: async () => ({ advanced: false, files: new Set<string>() }) }))
      .toMatchObject({ status: "ready" });
  }
}, 30000);
