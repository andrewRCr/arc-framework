/** The activation report's explicit merge is executable without an upstream or surviving tracking ref. */
import { afterEach, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { computeDefaultCaptureSet } from "../../src/lib/git/default-capture-set.js";
import { createLifecycleHarness } from "../helpers/store/lifecycle-harness.js";
import { createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { activationCaptureReport, planActivationBranch } from "../../src/lib/work-unit/verbs/activation-branch-plan.js";

let root: string | undefined;
afterEach(async () => { if (root !== undefined) await cleanupTempDir(root); root = undefined; });
const MERGE_REPORT_TIMEOUT_MS = 30_000;

describe("activation report merge", () => {
  it("brings in the reported remote-only commit with merge.ff=only after its ref is gone", async () => {
    root = await createTempRepo(); const exec = makeGitExec(root);
    await exec("git", ["branch", "-M", "main"]);
    await writeFile(join(root, "base"), "base\n"); await exec("git", ["add", "base"]); await exec("git", ["commit", "-m", "base"]);
    const base = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
    await exec("git", ["switch", "-c", "remote-work"]);
    await writeFile(join(root, "remote-only"), "task work\n"); await exec("git", ["add", "remote-only"]); await exec("git", ["commit", "-m", "task work"]);
    const remote = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
    await exec("git", ["update-ref", "refs/remotes/origin/person", remote]);
    await exec("git", ["switch", "-c", "person", base]); await exec("git", ["config", "merge.ff", "only"]);
    const inventory = await computeDefaultCaptureSet({ cwd: root, exec, baseBranch: "main", repository: "repo", refreshBranch: "person", refresh: false });
    expect(inventory.status).toBe("available"); if (inventory.status !== "available") return;
    const report = await activationCaptureReport(exec, root, inventory, "person");
    expect(report.lines).toContain(`${remote}: first git merge --ff --no-edit ${remote}; then arc task close <ids> --commit ${remote}`);
    await exec("git", ["update-ref", "-d", "refs/remotes/origin/person"]);
    await exec("git", ["merge", "--ff", "--no-edit", remote]);
    expect((await exec("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(remote);
    expect((await exec("git", ["show", "HEAD:remote-only"])).stdout).toContain("task work");
  }, MERGE_REPORT_TIMEOUT_MS);
});

it("keeps original-graph merge and deletion advice when replacement refs fake containment", async () => {
  root = await createTempRepo(); const exec = makeGitExec(root);
  await exec("git", ["branch", "-M", "main"]);
  await writeFile(join(root, "base"), "base\n"); await exec("git", ["add", "base"]); await exec("git", ["commit", "-m", "base"]);
  await exec("git", ["switch", "-c", "feat/demo"]);
  await writeFile(join(root, "local"), "local\n"); await exec("git", ["add", "local"]); await exec("git", ["commit", "-m", "local work"]);
  const local = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  await exec("git", ["switch", "-c", "remote-work", "main"]);
  await writeFile(join(root, "remote"), "remote\n"); await exec("git", ["add", "remote"]); await exec("git", ["commit", "-m", "remote work"]);
  const remote = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  await exec("git", ["update-ref", "refs/remotes/origin/feat/demo", remote]);
  await exec("git", ["switch", "feat/demo"]);
  await exec("git", ["replace", "--graft", local, remote]);
  const h = createLifecycleHarness(), primary = await h.seedMeta("demo", { state: "Planning", currentWorkflow: "draft-design" },
    { kind: "active" }, { branches: [{ repository: "repo", ref: "feat/demo", linkedAs: "created", excluded: [] }] });
  const input = { exec, execRaw: createExecaRawGitExec(root), cwd: root, name: "demo", toBranch: "fix/demo",
    baseBranch: "main", repository: "repo", primary, otherPrimaries: [] };
  const replaced = await planActivationBranch(input);
  expect(replaced.status).toBe("ready"); if (replaced.status !== "ready") return;
  expect(replaced.report).toContain(`${remote}: first git merge --ff --no-edit ${remote}; then arc task close <ids> --commit ${remote}`);
  expect(replaced.remoteDelete).toEqual({ text: `After git merge --ff --no-edit ${remote}, git push origin --delete feat/demo` });
  await exec("git", ["replace", "-d", local]);
  const original = await planActivationBranch(input);
  expect(original.status).toBe("ready"); if (original.status !== "ready") return;
  expect(replaced.report).toEqual(original.report);
  expect(replaced.remoteDelete).toEqual(original.remoteDelete);
}, MERGE_REPORT_TIMEOUT_MS);
