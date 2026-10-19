/** Explicit Store injection governs parent allocation as well as Errand records. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it, onTestFinished } from "vitest";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness } from "../helpers/store/lifecycle-harness.js";
import { openOrdinaryErrandAtRuntime } from "../../src/lib/errand/open-runtime.js";
import { createExecaGitExecInput } from "../../src/lib/git/process-executor.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, writeWorktreeMarker, readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";

it("opens from a Store-only parent without changing the default Store factory", async () => {
  const cwd = await createTempRepo(), exec = makeGitExec(cwd), h = createLifecycleHarness(), project = randomUUID();
  onTestFinished(() => cleanupTempDir(cwd));
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\narchive.cadence: manual\n");
  await writeFile(join(cwd, ".gitignore"), ".arc-checkouts/\n");
  await exec("git", ["add", "."]); await exec("git", ["commit", "-m", "Initialize parent fixture"]);
  await h.seedMeta("parent", { state: "Planning", owner: "alice", currentWorkflow: "draft-design" });
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "parent-project", uid: project })), "{}");
  await ensureWorktreeMarkerIgnored(cwd, exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(cwd, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "parent" }, spawningIdentity: "alice", createdAt: "2026-10-19T00:00:00Z" });
  const result = await openOrdinaryErrandAtRuntime({ cwd, store: h.store, projectId: async () => project, slug: "child", intent: "Child concern", inbox: null, protection: "full", base: "main", syncBase: false,
    createdAt: "2026-10-19T00:00:00Z", identity: "alice", locationTemplate: join(cwd, ".arc-checkouts/{name}"), repo: "repo", isolation: "require-isolation",
    postCreateScript: "", registeredHarnessDirs: "", identityGlobalUserDir: join(cwd, ".arc/user/alice"), exec, execInput: createExecaGitExecInput() });
  expect(result, JSON.stringify(result)).toMatchObject({ outcome: "applied" });
  expect(await readWorktreeMarker(cwd)).toMatchObject({ kind: "present", marker: { createdFor: { name: "parent" } } });
  expect(await h.store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: SlugSchema.parse("parent") } })).toMatchObject({ status: "ok" });
});
