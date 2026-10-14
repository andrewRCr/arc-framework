/** The activation report's explicit merge is executable without an upstream or surviving tracking ref. */
import { afterEach, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { computeDefaultCaptureSet } from "../../src/lib/git/default-capture-set.js";
import { activationCaptureReport } from "../../src/lib/work-unit/verbs/activation-branch-plan.js";

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
