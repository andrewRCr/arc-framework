/** Execute the cleanup action offered for a branch whose rebased commits all landed. */
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionInitProbeResultSchema } from "../../src/commands/status/schema.js";
import { cleanupTempDir, createTempRepo, git, runArc } from "./helpers.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => cleanupTempDir(root)));
});

describe("session orphan cleanup actions", () => {
  it("deletes a rebased orphan by executing its offered argv", async () => {
    const root = await createTempRepo();
    roots.push(root);
    const origin = await mkdtemp(join(tmpdir(), "arc-orphan-origin-"));
    roots.push(origin);
    const initialized = await runArc(["init", "--yes", "--name", "orphan-actions"], root);
    expect(initialized.exitCode, initialized.stderr).toBe(0);
    await git(root, ["config", "arc.identity", "test-user"]);
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "chore: initialize"]);
    await git(root, ["init", "--bare", origin]);
    await git(root, ["remote", "add", "origin", origin]);
    await git(root, ["push", "-u", "origin", "main"]);
    const branch = "feat/rebased";
    await git(root, ["checkout", "-b", branch]);
    const commits: string[] = [];
    for (const name of ["first", "second"]) {
      await writeFile(join(root, `${name}.txt`), `${name} patch\n`);
      await git(root, ["add", `${name}.txt`]);
      await git(root, ["commit", "-m", `feat: ${name}`]);
      commits.push(await git(root, ["rev-parse", "HEAD"]));
    }
    await git(root, ["push", "-u", "origin", branch]);
    await git(root, ["checkout", "main"]);
    await writeFile(join(root, "base-advance.txt"), "advance base\n");
    await git(root, ["add", "base-advance.txt"]);
    await git(root, ["commit", "-m", "chore: advance base"]);
    await git(root, ["cherry-pick", ...commits]);
    await git(root, ["push", "origin", "main"]);
    await git(origin, ["update-ref", "-d", `refs/heads/${branch}`]);
    await git(root, ["fetch", "--prune", "origin"]);
    await expect(git(root, ["merge-base", "--is-ancestor", branch, "main"])).rejects.toThrow();
    await expect(git(root, ["branch", "-d", branch])).rejects.toThrow();

    const result = await runArc(["status", "--session-init", "--json"], root);
    expect(result.exitCode, result.stderr).toBe(0);
    const envelope = SessionInitProbeResultSchema.parse(JSON.parse(result.stdout));
    if (envelope.orphanBranchSweep?.ok !== true) throw new Error("orphan sweep failed");
    const report = envelope.orphanBranchSweep.value.orphans.find((orphan) => orphan.branch === branch);
    if (report === undefined || report.merged === null) throw new Error("orphan evidence missing");
    expect(report.merged).toBe(true);
    expect(report.shippedWorkUnit).toBeNull();
    const argv = report.actions?.[0]?.argv;
    expect(argv).toEqual(["git", "branch", "-D", branch]);
    if (argv === undefined || argv[0] !== "git") throw new Error("missing Git cleanup action");
    await git(root, argv.slice(1));
    expect(await git(root, ["for-each-ref", `refs/heads/${branch}`])).toBe("");
  }, 60_000);
});
