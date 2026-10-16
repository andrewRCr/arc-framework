/** Real Git and checked operational records shared by unclosed-task integration cases. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { onTestFinished } from "vitest";
import { createTempRepo, cleanupTempDir, execFileAsync } from "./integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "./store/lifecycle-harness.js";
import { createExecaGitExec, createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { computeCopyKeys } from "../../src/lib/git/copy-key.js";
import { recordReferences, type Links } from "../../src/lib/store/index.js";
import { recordPut, batchLifecycleWrites } from "../../src/lib/store/lifecycle-write.js";
export const unclosedTaskList = "# Task List: demo\n\n### `[ ]` **1.1 Work**\n\n- _Goal:_ Implement.\n\n    - `[ ]` **1.1.a Earlier**\n    - `[ ]` **1.1.b Later**\n";
/** Create one isolated repository and exact store record group without a code-branch state artifact. */
export async function makeUnclosedTaskFixture(options: { state?: "Planning" | "Active"; tasks?: string } = {}) {
  const cwd = await createTempRepo("arc-unclosed-task-");
  onTestFinished(() => cleanupTempDir(cwd));
  let clock = 1700000000;
  const git = async (args: string[], timestamp = ++clock, author = timestamp): Promise<string> => (await execFileAsync("git", args, { cwd,
    env: { ...process.env, GIT_COMMITTER_DATE: `${timestamp} +0000`, GIT_AUTHOR_DATE: `${author} +0000`, GIT_EDITOR: "true", GIT_SEQUENCE_EDITOR: "true", FORCE_COLOR: "0" } })).stdout.trim();
  const commit = async (content: string, file = "work.txt") => {
    await writeFile(join(cwd, file), content); await git(["add", file]);
    await git(["commit", "-m", content.trim()]); return git(["rev-parse", "HEAD"]);
  };
  await commit("base\n"); await git(["branch", "-M", "main"]); await git(["switch", "-c", "feat/demo"]);
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("demo", { state: options.state ?? "Active", currentWorkflow: options.state === "Planning" ? "draft-design" : "process-task-loop" }, { kind: "active" }, { branches: [{ repository: "repo", ref: "feat/demo", linkedAs: "created", excluded: [] }] });
  const tasks = await h.seed(recordReferences["work-item/task-list"](primary.reference.owner), options.tasks ?? unclosedTaskList);
  const readMeta = () => h.store.read({ reference: primary.reference }).then(lifecycleSuccess);
  const putLinks = async (links: Links) => lifecycleSuccess(await batchLifecycleWrites(h.store,
    [recordPut(await readMeta(), { links })], { verb: "seed-links", lifecycleAction: "capture" }));
  const capture = async (sha: string) => {
    const facts = (await computeCopyKeys({ cwd, commits: [sha] })).get(sha);
    return { repository: "repo", sha, ...(facts?.copyKey === undefined ? {} : { copyKey: facts.copyKey }) };
  };
  const input = { store: h.store, slug: "demo", cwd, baseBranch: "main", projectId: async () => "repo", exec: createExecaGitExec(), execRaw: createExecaRawGitExec(cwd) };
  return { ...h, cwd, git, commit, readMeta, putLinks, capture, tasks, input };
}
