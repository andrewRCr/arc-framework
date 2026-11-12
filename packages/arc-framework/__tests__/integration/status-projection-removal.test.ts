/** Native status compositions keep projected edits out of automatic cleanup recommendations. */
import { afterEach, expect, it } from "vitest";
import { SessionInitRecoveryValueSchema } from "../../src/lib/session-init/branch-gone-cascade.js";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture, retirementFixtureRoots as roots } from "../helpers/store/projection-retirement.js";
import { cleanupTempDir, makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { seedProjection } from "../helpers/store/projection/seeded-projection.js";
import { writeWorktreeMarker, readWorktreeMarker, ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs } from "../../src/lib/git/worktree-marker.js";
import { createRawGitExec, readGitBlobBytes } from "../../src/lib/io-context.js";
import { createSessionStatusContext } from "../../src/handlers/status/session-context.js";
import { composeSessionInitStatus } from "../../src/handlers/status.js";

import { runStaleWorktreeSweep } from "../../src/lib/session-init/stale-worktree-sweep.js";
import { runDerivedLocusStateProbe } from "../../src/handlers/derived-locus-state-probe.js";
import { createProjectionRemovalSlots } from "../../src/lib/store/projection/removal-slots.js";
import { createProjectIdentityReader } from "../../src/lib/store/project-identity.js";
import { nodeUserSurfaceMigrationFs } from "../../src/lib/user-surface-migration.js";

import { runBranchGoneRecovery } from "../../src/lib/session-init/branch-gone-recovery.js";

import { createSessionRemoteContextReader } from "../../src/handlers/status-remote-context.js";
import { sessionCleanupBaseEvidence } from "../../src/handlers/status/session-evidence.js";

afterEach(async () => { for (const root of roots.splice(0)) await cleanupTempDir(root); });

async function target() {
  const h = await fixture({ end: "archive", projected: true });
  await h.exec("git", ["switch", "main"]);
  await h.exec("git", ["merge", "--ff-only", h.workOid]);
  await mkdir(join(h.root, ".arc/system"), { recursive: true });
  await writeFile(join(h.root, ".arc/system/arc-config.yml"), "branch.base: main\nbranch.protection: full\nsession.remote_sync: enabled\n");
  await h.exec("git", ["add", ".arc/system/arc-config.yml"]); await h.exec("git", ["commit", "-m", "Configure status fixture"]);
  await h.exec("git", ["push", "origin", "main"]);
  const projectId = "34567890-1234-4234-8234-123456789abc";
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project", uid: projectId })),
    JSON.stringify({ projectId }));
  const checkout = join(h.root, "checkout-archived");
  await h.exec("git", ["worktree", "add", checkout, "feat/demo"]);
  await ensureWorktreeMarkerIgnored(checkout, h.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(checkout, { ...h.marker, spawnedByArc: true });
  const record = await h.seed(recordReferences["personal/document"](OwnerIdentitySchema.parse({ type: "person", name: "test-user" }), "scratch/status.md"),
    "Preserve the status target's prose.\n");
  const path = ".arc/user/test-user/scratch/status.md";
  await seedProjection({ checkout, store: h.store, identity: SlugSchema.parse("test-user"), files: [{ path, reference: record.reference }] });
  const held = join(checkout, ".arc/user/blair/scratch/held.md");
  await mkdir(join(checkout, ".arc/user/blair/scratch"), { recursive: true });
  await writeFile(held, "A saved edit that cleanup must retain.\n");
  return { ...h, checkout, held };
}

async function compose(h: Awaited<ReturnType<typeof target>>, cwd = h.root) {
  const exec = makeGitExec(cwd), raw = createRawGitExec(cwd);
  return (await composeSessionInitStatus(await createSessionStatusContext(cwd, exec, raw, raw, undefined, { store: h.store }))).result;
}

it("blocks a completed checkout's cleanup recommendation until its refused projected edit is repaired", async () => {
  const h = await target(), marker = await readWorktreeMarker(h.checkout);
  const held = await compose(h);
  expect(held.sweep, JSON.stringify(held)).toMatchObject({ ok: true, value: { worktrees: expect.arrayContaining([
    expect.objectContaining({ worktreePath: h.checkout, decision: { action: "blocked", reason: "uncommitted" } }),
  ]) } });
  expect(await readFile(h.held, "utf8")).toBe("A saved edit that cleanup must retain.\n");
  expect(await readWorktreeMarker(h.checkout)).toEqual(marker);
  await rm(h.held);
  const repaired = await compose(h);
  expect(repaired.sweep, JSON.stringify(repaired)).toMatchObject({ ok: true, value: { worktrees: expect.arrayContaining([
    expect.objectContaining({ worktreePath: h.checkout, decision: { action: "removable" } }),
  ]) } });
  expect(await readWorktreeMarker(h.checkout)).toEqual(marker);
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(h.checkout);
}, 60_000);

it("keeps a held projection out of branch-gone recovery's removable recommendations", async () => {
  const h = await target(), marker = await readWorktreeMarker(h.checkout);
  const gone = await goneCheckout(h);
  const held = await compose(h, gone);
  expect(held.worktree).toMatchObject({ ok: true, value: { state: "branch-gone" } });
  expect(recoveryCandidates(held.recovery)).toContainEqual({ branch: "feat/demo", worktreePath: h.checkout, proposedAction: "switch" });
  expect(await readWorktreeMarker(h.checkout)).toEqual(marker);
  await rm(h.held);
  const repaired = await compose(h, gone);
  expect(recoveryCandidates(repaired.recovery)).toContainEqual(expect.objectContaining({
    branch: "feat/demo", worktreePath: h.checkout, proposedAction: "removable",
  }));
  expect(await readWorktreeMarker(h.checkout)).toEqual(marker);
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(h.checkout);
}, 60_000);

function recoveryCandidates(slot: unknown) {
  const envelope = slot as { ok: boolean; value?: unknown };
  expect(envelope.ok).toBe(true);
  const value = SessionInitRecoveryValueSchema.parse(envelope.value);
  return value.kind === "resolved" ? [value.candidate] : "candidates" in value ? value.candidates : [];
}

it("does not consult legacy user-surface safety when the Store owns cleanup", async () => {
  const h = await target(); await rm(h.held);
  const status = await compose(h);
  if (!status.roster?.ok) throw new Error("Expected the native roster");
  const frame = await runDerivedLocusStateProbe({ cwd: h.root, exec: h.exec, store: h.store, identity: "test-user", baseBranch: "main" });
  const result = await runStaleWorktreeSweep({ store: h.store, projectId: createProjectIdentityReader(h.store),
    exec: h.exec, identity: "test-user", baseBranch: "main", worktreeIdentity: { kind: "primary" },
    baseEvidence: await cleanupEvidence(h.root),
    roster: status.roster.value, derivedRoster: frame.roster,
    projectionRemovalSlots: createProjectionRemovalSlots({ store: h.store, identity: "test-user" }),
    readBlob: (ref, path) => readGitBlobBytes(h.root, ref, path),
    userSurfaceFs: { ...nodeUserSurfaceMigrationFs, readDir: async () => { throw new Error("Legacy user-surface reads are unavailable."); } },
  });
  expect(result.worktrees).toContainEqual(expect.objectContaining({ worktreePath: h.checkout, decision: { action: "removable" } }));
  expect(await readWorktreeMarker(h.checkout)).toMatchObject({ kind: "present" });
}, 60_000);

async function goneCheckout(h: Awaited<ReturnType<typeof target>>) {
  const gone = join(h.root, "checkout-gone");
  await h.exec("git", ["worktree", "add", "-b", "feat/gone", gone, "main"]);
  await h.exec("git", ["push", "-u", "origin", "feat/gone"], { cwd: gone });
  await h.exec("git", ["push", "origin", "--delete", "feat/gone"]);
  return gone;
}

it("does not consult legacy user-surface safety during Store-backed branch-gone recovery", async () => {
  const h = await target(); await rm(h.held);
  const gone = await goneCheckout(h), exec = makeGitExec(gone);
  const status = await compose(h, gone);
  expect(status.worktree).toMatchObject({ ok: true, value: { state: "branch-gone" } });
  if (!status.roster?.ok) throw new Error("Expected the native roster");
  const frame = await runDerivedLocusStateProbe({ cwd: gone, exec, store: h.store, identity: "test-user", baseBranch: "main" });
  const result = await runBranchGoneRecovery({ store: h.store, exec, baseBranch: "main", currentBranch: "feat/gone", recentBranches: [],
    baseEvidence: await cleanupEvidence(gone),
    roster: status.roster.value, derivedRoster: frame.roster,
    projectionRemovalSlots: createProjectionRemovalSlots({ store: h.store, identity: "test-user" }),
    userSurfaceFs: { ...nodeUserSurfaceMigrationFs, readDir: async () => { throw new Error("Legacy user-surface reads are unavailable."); } },
  });
  const candidates = result.kind === "resolved" ? [result.candidate] : "candidates" in result ? result.candidates : [];
  expect(candidates).toContainEqual(expect.objectContaining({ worktreePath: h.checkout, proposedAction: "removable" }));
  expect(await readWorktreeMarker(h.checkout)).toMatchObject({ kind: "present" });
}, 60_000);

async function cleanupEvidence(cwd: string) {
  return sessionCleanupBaseEvidence(await createSessionRemoteContextReader({ cwd, exec: makeGitExec(cwd),
    execInput: makeGitExecInput(cwd), remoteSyncEnabled: async () => true })());
}
