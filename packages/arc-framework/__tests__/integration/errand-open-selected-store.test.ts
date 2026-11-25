/** Explicit Store injection governs parent allocation as well as Errand records. */
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it, onTestFinished } from "vitest";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness } from "../helpers/store/lifecycle-harness.js";
import { readWorktreeLock } from "../helpers/worktree-lock.js";
import { openOrdinaryErrandAtRuntime } from "../../src/lib/errand/open-runtime.js";
import { createExecaGitExecInput } from "../../src/lib/git/process-executor.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, writeWorktreeMarker, readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { PROJECTION_LOCK_REASON } from "../../src/lib/git/worktree-removal.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";

async function fixture() {
  const cwd = await createTempRepo(), exec = makeGitExec(cwd), h = createLifecycleHarness(), project = randomUUID();
  onTestFinished(() => cleanupTempDir(cwd));
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\narchive.cadence: manual\n");
  await writeFile(join(cwd, ".gitignore"), ".arc-checkouts/\n");
  await exec("git", ["add", "."]); await exec("git", ["commit", "-m", "Initialize parent fixture"]);
  const meta = await h.seedMeta("parent", { state: "Planning", owner: "alice", currentWorkflow: "draft-design" });
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "parent-project", uid: project })), "{}");
  await ensureWorktreeMarkerIgnored(cwd, exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(cwd, { spawnedByArc: false, createdFor: boundWorkUnitSubject(meta), spawningIdentity: "alice", createdAt: "2026-10-19T00:00:00Z" });
  const open = () => openOrdinaryErrandAtRuntime({ cwd, store: h.store, projectId: async () => project, slug: "child", intent: "Child concern", inbox: null, protection: "full", base: "main", syncBase: false,
    createdAt: "2026-10-19T00:00:00Z", identity: "alice", locationTemplate: join(cwd, ".arc-checkouts/{name}"), repo: "repo", isolation: "require-isolation",
    postCreateScript: "", registeredHarnessDirs: "", identityGlobalUserDir: join(cwd, ".arc/user/alice"), exec, execInput: createExecaGitExecInput() });
  return { ...h, cwd, exec, meta, open };
}

it("opens from a Store-only parent without changing the default Store factory", async () => {
  const h = await fixture();
  const result = await h.open();
  expect(result, JSON.stringify(result)).toMatchObject({ outcome: "applied" });
  expect(await readWorktreeMarker(h.cwd)).toMatchObject({ kind: "present", marker: { createdFor: { name: "parent" } } });
  expect(await h.store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: SlugSchema.parse("parent"), uid: boundWorkUnitSubject(h.meta).uid } })).toMatchObject({ status: "ok" });
});

it("locks the checkout an isolated Errand spawns with the projection's reason", async () => {
  const h = await fixture();
  const result = await h.open();
  if (result.outcome !== "applied" || result.allocation?.kind !== "spawned") throw new Error(JSON.stringify(result));
  expect(await readWorktreeLock(h.exec, result.allocation.checkoutPath)).toBe(PROJECTION_LOCK_REASON);
});
