/** Native status compositions keep projected edits out of automatic cleanup recommendations. */
import { afterEach, expect, it } from "vitest";
import { SessionInitRecoveryValueSchema } from "../../src/lib/session-init/branch-gone-cascade.js";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture, retirementFixtureRoots as roots } from "../helpers/store/projection-retirement.js";
import { cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { seedProjection } from "../helpers/store/projection/seeded-projection.js";
import { writeWorktreeMarker, readWorktreeMarker, ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs } from "../../src/lib/git/worktree-marker.js";
import { createRawGitExec } from "../../src/lib/io-context.js";
import { createSessionStatusContext } from "../../src/handlers/status/session-context.js";
import { composeSessionInitStatus } from "../../src/handlers/status.js";

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
  const gone = join(h.root, "checkout-gone");
  await h.exec("git", ["worktree", "add", "-b", "feat/gone", gone, "main"]);
  await h.exec("git", ["push", "-u", "origin", "feat/gone"], { cwd: gone });
  await h.exec("git", ["push", "origin", "--delete", "feat/gone"]);
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
