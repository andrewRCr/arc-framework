/** The activation report's explicit merge is executable without an upstream or surviving tracking ref. */
import { afterEach, describe, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { addBareRemote, createTempRepo, cleanupTempDir, makeCommit, makeGitExec } from "../helpers/integration.js";
import { computeDefaultCaptureSet } from "../../src/lib/git/default-capture-set.js";
import { createLifecycleHarness } from "../helpers/store/lifecycle-harness.js";
import { createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { activationCaptureReport, planActivationBranch } from "../../src/lib/work-unit/verbs/activation-branch-plan.js";

let root: string | undefined;
afterEach(async () => { if (root !== undefined) await cleanupTempDir(root); root = undefined; });
const MERGE_REPORT_TIMEOUT_MS = 30_000;

describe("activation report merge", () => {
  it.each([false, true])("preserves the old remote tip when deleting its branch (concurrent push: %s)", async (advanced) => {
    root = await createTempRepo();
    const exec = makeGitExec(root);
    await makeCommit(root, "base");
    const origin = await addBareRemote(root);
    await exec("git", ["switch", "--detach"]);
    const oldTip = await makeCommit(root, "work pushed from another checkout");
    await exec("git", ["push", "origin", "HEAD:refs/heads/plan/demo"]);
    await exec("git", ["switch", "-c", "plan/demo", "main"]);

    const primary = await createLifecycleHarness().seedMeta("demo", { state: "Planning", currentWorkflow: "draft-design" },
      { kind: "active" }, { branches: [{ repository: "repo", ref: "plan/demo", linkedAs: "created", excluded: [] }] });
    const plan = await planActivationBranch({ exec, execRaw: createExecaRawGitExec(root), cwd: root,
      name: "demo", toBranch: "feat/demo", baseBranch: "main", repository: "repo", primary, otherPrimaries: [] });
    if (plan.status !== "ready") throw new Error(plan.reason);
    await plan.step.run();

    const report = plan.remoteDelete?.text ?? "";
    const merges = report.match(/\bgit merge [^,;&`\n]+/gu) ?? [];
    const pushes = report.match(/\bgit push [^,;&`\n]+/gu) ?? [];
    expect(merges).toHaveLength(1);
    expect(pushes, "Only the deletion belongs in the report; the workflow publishes the replacement").toHaveLength(1);
    const [merge] = merges;
    const [deletion] = pushes;
    if (merge === undefined || deletion === undefined) throw new Error(`Missing commands in ${report}`);
    const deleteArgs = deletion.trim().split(/\s+/u).slice(1);
    await exec("git", merge.trim().split(/\s+/u).slice(1));
    await exec("git", ["push", "-u", "origin", plan.link.ref]);
    const published = await exec("git", ["rev-parse", `refs/heads/${plan.link.ref}`], { cwd: origin });
    expect(published.stdout.trim(), "replacement branch tip before deletion").toBe(oldTip);

    let preservedTip = oldTip;
    if (advanced) {
      await exec("git", ["switch", "--detach", oldTip]);
      preservedTip = await makeCommit(root, "work pushed after activation planned the deletion");
      await exec("git", ["push", origin, "HEAD:refs/heads/plan/demo"]);
      await exec("git", ["switch", plan.link.ref]);
      await expect(exec("git", deleteArgs)).rejects.toThrow(/stale info/u);
      const old = await exec("git", ["rev-parse", "refs/heads/plan/demo"], { cwd: origin });
      expect(old.stdout.trim()).toBe(preservedTip);

      await exec("git", ["fetch", "origin", "refs/heads/plan/demo"]);
      const { stdout: fetchedTip } = await exec("git", ["rev-parse", "FETCH_HEAD"]);
      const newTip = fetchedTip.trim();
      expect(newTip).toBe(preservedTip);
      await exec("git", ["merge", "--ff", "--no-edit", newTip]);
      await exec("git", ["push", "-u", "origin", plan.link.ref]);
      await exec("git", deleteArgs.map(arg => arg.replace(oldTip, newTip)));
    } else {
      await exec("git", deleteArgs);
    }
    const branches = await exec("git", ["for-each-ref", "--format=%(refname)", "--contains", preservedTip, "refs/heads"], { cwd: origin });
    expect(branches.stdout.trim().split(/\s+/u).filter(Boolean), "origin branches containing the old tip").toEqual(["refs/heads/feat/demo"]);
  }, MERGE_REPORT_TIMEOUT_MS);

  it("completes the reported merge before the workflow push and waits for the push before deletion", async () => {
    const workflow = await readFile(new URL("../../arc/system/workflows/arc/work-unit-lifecycle/activate-work-unit.md",
      import.meta.url), "utf8");
    const pushStep = workflow.slice(workflow.indexOf("### 4)"), workflow.indexOf("### 5)"));
    const push = pushStep.indexOf("`workflowPush`");
    expect(push).toBeGreaterThan(-1);
    expect(pushStep.slice(0, push)).toMatch(/\b(?:complete|run)\b[^.]*\bmerge\b/iu);
    expect(pushStep.slice(push)).toMatch(/\b(?:after|once)\b[^.]*\bpush\b[^.]*\bsucceeds\b[^.]*\bdeletion\b/iu);
    expect(pushStep).toMatch(/stale[\s\S]*git fetch[\s\S]*git merge[\s\S]*routed push[\s\S]*retry the deletion[^.]*lease/iu);
  });

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
  expect(replaced.remoteDelete).toEqual({
    text: `After git merge --ff --no-edit ${remote}, and once fix/demo is pushed, git push --force-with-lease=refs/heads/feat/demo:${remote} origin --delete feat/demo`,
  });
  await exec("git", ["replace", "-d", local]);
  const original = await planActivationBranch(input);
  expect(original.status).toBe("ready"); if (original.status !== "ready") return;
  expect(replaced.report).toEqual(original.report);
  expect(replaced.remoteDelete).toEqual(original.remoteDelete);
}, MERGE_REPORT_TIMEOUT_MS);
