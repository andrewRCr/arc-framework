/** CI's steps that run ARC over the checkout carry the in-repo store override only on the storage cutover's own branch
 * while its checked-out tree still tracks ARC state. */
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { load } from "js-yaml";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "../../../..");
type Workflow = { jobs: Record<string, { steps: Array<{ id?: string; run?: string }> }> };

const steps = [["setup", "forecast"], ["lint-typecheck", "markdown-underwrap"]] as const;
const flipPullRequest = { GITHUB_HEAD_REF: "feat/cutover-flip", GITHUB_REF_NAME: "12/merge" };
const flipDispatch = { GITHUB_HEAD_REF: "", GITHUB_REF_NAME: "feat/cutover-flip" };
const otherPullRequest = { GITHUB_HEAD_REF: "feat/other-work", GITHUB_REF_NAME: "13/merge" };
const cases = [
  { run: "a pull request from the flip's branch over a tree tracking state", branch: flipPullRequest, tree: "tracking", expected: "1" },
  { run: "a dispatched run on the flip's branch over a tree tracking state", branch: flipDispatch, tree: "tracking", expected: "1" },
  { run: "the flip's branch over a tree tracking no state", branch: flipPullRequest, tree: "clean", expected: "unset" },
  { run: "another branch over a tree tracking state", branch: otherPullRequest, tree: "tracking", expected: "unset" },
  { run: "a branch named only cutover-flip", branch: { GITHUB_HEAD_REF: "", GITHUB_REF_NAME: "cutover-flip" }, tree: "tracking",
    expected: "unset" },
] as const;

let root: string;
let workflow: Workflow;
const checkouts: Record<"tracking" | "clean", string> = { tracking: "", clean: "" };

async function checkout(path: string): Promise<string> {
  const directory = join(root, path.replaceAll("/", "-"));
  await mkdir(dirname(join(directory, path)), { recursive: true });
  await writeFile(join(directory, path), "tracked\n");
  for (const args of [["init", "-q", "-b", "main"], ["add", "-A"],
    ["-c", "user.email=test@example.com", "-c", "user.name=Test", "-c", "core.hooksPath=/dev/null", "commit", "-qm", "fixture"]]) {
    await execFileAsync("git", args, { cwd: directory });
  }
  return directory;
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-ci-override-"));
  workflow = load(await readFile(join(repositoryRoot, ".github/workflows/ci.yml"), "utf8")) as Workflow;
  // Every ARC invocation in a step records the override it sees, standing in for the CLI.
  await mkdir(join(root, "bin"));
  await writeFile(join(root, "bin", "node"), "#!/bin/sh\nprintf '%s\\n' \"${ARC_IN_REPO_STORE-unset}\" >> \"$OVERRIDE_LOG\"\nprintf base\n");
  await chmod(join(root, "bin", "node"), 0o755);
  checkouts.tracking = await checkout(".arc/active/meta-one.md");
  checkouts.clean = await checkout(".arc/system/arc-config.yml");
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

describe.each(steps)("the %s job's %s step", (job, id) => {
  it.each(cases)("for $run, sees the override as $expected", async ({ branch, tree, expected }) => {
    const run = workflow.jobs[job]?.steps.find((step) => step.id === id)?.run;
    if (run === undefined) throw new Error(`Missing ${job} step ${id}`);
    const runnerTemp = await mkdtemp(join(root, "runner-"));
    const log = join(runnerTemp, "override.log");
    await execFileAsync("bash", ["-e", "-c", run], { cwd: checkouts[tree], env: {
      PATH: `${join(root, "bin")}${delimiter}${process.env.PATH ?? ""}`, HOME: root, RUNNER_TEMP: runnerTemp,
      OVERRIDE_LOG: log, EVENT_NAME: "pull_request", PUSH_BEFORE: "", ...branch } });
    const seen = (await readFile(log, "utf8")).trim().split("\n");
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen)).toEqual(new Set([expected]));
  });
});
