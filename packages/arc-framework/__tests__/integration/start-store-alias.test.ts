/** Retained names resolve to one canonical work item through start dispatch and graduation. */
import { afterEach, expect, it } from "vitest";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { StartCommandInputSchema } from "../../src/handlers/start.js";
import { handleStoreStart } from "../../src/handlers/start-store.js";
import { runStoreRename } from "../../src/lib/work-unit/verbs/rename-store.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { readLifecycleView } from "../../src/lib/store/lifecycle-view.js";
import { resolveProcessInteractionContext } from "../../src/lib/command-input/interaction-context.js";

let root: string | undefined;
const initialExitCode = process.exitCode;
const START_TIMEOUT_MS = 30_000;
afterEach(async () => { process.exitCode = initialExitCode; if (root !== undefined) await cleanupTempDir(root); root = undefined; });

async function fixture() {
  root = await createTempRepo(); const exec = makeGitExec(root);
  await exec("git", ["branch", "-M", "main"]); await exec("git", ["commit", "--allow-empty", "-m", "base"]);
  const path = join(root, "checkout"), system = join(root, ".arc", "system");
  await mkdir(system, { recursive: true });
  await writeFile(join(system, "arc-config.yml"), `branch.base: main\nworktree.location_template: ${path}\n`);
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("source", { state: "Planning", owner: "previous", currentWorkflow: "draft-design" }, { kind: "backlog", commitment: "planned" });
  expect(await runStoreRename({ store: h.store, cwd: root, exec, baseBranch: "main" }, { sourceSlug: "source", targetSlug: "target" }))
    .toMatchObject({ status: "renamed" });
  const io = { ...createUserIOContext(), exec };
  const executor = buildExecutorContext({ cwd: root, io, store: h.store, identity: "starter", teamMode: false, internalTemplateDir: "/templates" });
  const interaction = resolveProcessInteractionContext({ noInput: true, machineReadable: false, yes: "absent" });
  return { ...h, root, exec, io, executor, interaction, path, meta };
}

it("dispatches a former name to its canonical stub while refusing explicit creation", async () => {
  const h = await fixture(); const ctx = { cwd: h.root, identity: "starter", executor: h.executor, io: h.io, interaction: h.interaction };
  await handleStoreStart(StartCommandInputSchema.parse({ name: "source", new: true }), ctx);
  expect(process.exitCode).toBe(1);
  expect(await stat(h.path).catch(() => null)).toBeNull();
  process.exitCode = 0;
  await handleStoreStart(StartCommandInputSchema.parse({ name: "source" }), ctx);
  expect(process.exitCode).toBe(0);
  expect(await readWorktreeMarker(h.path)).toMatchObject({ kind: "present", marker: { wuName: "target", createdFor: { kind: "work-unit", name: "target" } } });
  const alias = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("source") }));
  const canonical = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("target") }));
  expect(alias.reference).toEqual(canonical.reference);
  expect(alias.reference.owner).toEqual({ ...h.meta.reference.owner, name: "target" });
  expect(lifecycleSuccess(await h.store.read({ reference: alias.reference }))).toMatchObject({ placement: { kind: "active" }, fields: { owner: "starter" } });
  expect(lifecycleSuccess(await readLifecycleView(h.store)).entries).toHaveLength(1);
  expect(await h.exec("git", ["symbolic-ref", "--quiet", "HEAD"], { cwd: h.path }).catch(() => null)).toBeNull();
}, START_TIMEOUT_MS);
