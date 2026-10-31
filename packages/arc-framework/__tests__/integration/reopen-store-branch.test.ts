/** Reopen observes the logical work request even when invoked on a retained branch. */
import { createClashDouble } from "../helpers/store/clash-double.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempDir, createTempRepo, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import type { VerbBase } from "../../src/handlers/lifecycle-shared.js";
import type { ExecuteTransitionContext } from "../../src/lib/work-unit/lifecycle-executor.js";
const state = vi.hoisted(() => ({ base: undefined as VerbBase | undefined,
  executor: undefined as ExecuteTransitionContext | undefined }));
vi.mock("../../src/handlers/lifecycle-shared.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/handlers/lifecycle-shared.js")>(),
  resolveVerbBase: () => Promise.resolve(state.base),
  buildExecutor: () => Promise.resolve({ executor: state.executor, settings: { "branch.base": "main" } }),
}));
import { handleReopen } from "../../src/handlers/lifecycle.js";
let root: string | undefined;
beforeEach(() => { vi.resetAllMocks(); process.exitCode = undefined; state.base = undefined; state.executor = undefined; });
afterEach(async () => { vi.restoreAllMocks(); process.exitCode = undefined; if (root !== undefined) await cleanupTempDir(root); root = undefined; });

it.each(["merged", "mid-verb"] as const)("retains the logical work request through %s selection", async scenario => {
  root = await createTempRepo(); const git = makeGitExec(root);
  await git("git", ["branch", "-M", "main"]);
  await writeFile(join(root, "base"), "base\n"); await git("git", ["add", "base"]); await git("git", ["commit", "-m", "base"]);
  await git("git", ["switch", "-c", "chore/retained"]);
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("demo", { state: "Integrating", currentWorkflow: "integrate-work-unit", taskList: "tasks-demo.md" }, { kind: "active" }, { branches: [
    { repository: "repo", ref: "chore/retained", linkedAs: "adopted", excluded: [] },
    { repository: "repo", ref: "feat/demo", linkedAs: "created", excluded: [] },
    { repository: "elsewhere", ref: "feat/foreign", linkedAs: "created", excluded: [] },
  ] });
  const content = "# Task List: demo\n\n### `[x]` **1.1 Done**\n";
  await h.seed(recordReferences["work-item/task-list"](meta.reference.owner), content);
  await mkdir(join(root, ".arc", "active"), { recursive: true });
  await writeFile(join(root, ".arc", "active", "tasks-demo.md"), content);
  const host = new Map([["chore/retained", "OPEN"], ["feat/demo", scenario === "merged" ? "MERGED" : "OPEN"]]);
  const io = { ...createUserIOContext(), exec: async (...args: Parameters<typeof git>) => {
    if (args[0] !== "gh") return git(...args);
    const argv = args[1], branch = argv[2]!;
    if (argv[1] === "view") return { stdout: JSON.stringify({ state: host.get(branch), isDraft: false }), stderr: "" };
    if (argv[1] === "close") { host.set(branch, "CLOSED"); return { stdout: "closed", stderr: "" }; }
    throw Error(`Unexpected host operation: ${argv.join(" ")}`);
  } };
  const other = await h.seedMeta("other");
  const store = scenario === "merged" ? h.store : createClashDouble(h.store, { slug: "demo", holders: [meta.reference, other.reference], mode: "mid-verb" });
  state.base = { cwd: root, identity: "test-user", io, store };
  state.executor = buildExecutorContext({ cwd: root, io, store, projectId: async () => "repo", identity: "test-user", teamMode: false, internalTemplateDir: "/templates" });
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output.push(String(chunk)); return true; });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => { output.push(String(chunk)); return true; });
  await handleReopen("demo", {});
  if (scenario === "merged") {
    expect(process.exitCode).toBe(1); expect(output.join("")).toContain("already merged");
    expect(lifecycleSuccess(await h.store.read({ reference: meta.reference }))).toEqual(meta);
    expect(host.get("feat/demo")).toBe("MERGED");
  } else {
    expect(process.exitCode, output.join("")).toBeUndefined();
    expect(lifecycleSuccess(await h.store.read({ reference: meta.reference })).fields).toMatchObject({ state: "Active" });
    expect(host.get("feat/demo")).toBe("CLOSED");
  }
  expect(host.get("chore/retained")).toBe("OPEN");
  expect(lifecycleSuccess(await h.store.read({ reference: other.reference }))).toEqual(other);
}, 30_000);
