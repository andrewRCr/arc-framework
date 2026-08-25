import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import type { RawGitExec } from "../../src/lib/change-facts.js";
import { proveGitDeliveryContribution } from "../../src/lib/delivery/git-contribution-proof.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => removeGitBackedDir(root)));
});

describe("delivery contribution proof against Git", () => {
  it("accepts an exact contribution mechanically reapplied onto a changed predecessor", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-delivery-contribution-" });
    roots.push(repository);
    const run = async (args: string[]): Promise<string> => (
      await execFileAsync("git", args, { cwd: repository })
    ).stdout.trim();
    const coordinate = async (head: string) => ({ head, tree: await run(["rev-parse", `${head}^{tree}`]) });
    await writeFile(join(repository, "base.txt"), "base\n", "utf8");
    await run(["add", "base.txt"]);
    await run(["commit", "-m", "base"]);
    const base = await run(["rev-parse", "HEAD"]);
    await run(["checkout", "-b", "before"]);
    await writeFile(join(repository, "feature.txt"), "feature\n", "utf8");
    await run(["add", "feature.txt"]);
    await run(["commit", "-m", "feature"]);
    const beforeMember = await run(["rev-parse", "HEAD"]);

    await run(["checkout", "-b", "after", base]);
    await writeFile(join(repository, "ambient.txt"), "ambient\n", "utf8");
    await run(["add", "ambient.txt"]);
    await run(["commit", "-m", "ambient"]);
    const afterPredecessor = await run(["rev-parse", "HEAD"]);
    await run(["cherry-pick", beforeMember]);
    const afterMember = await run(["rev-parse", "HEAD"]);
    const exec: RawGitExec = async (args) => {
      const result = await execFileAsync("git", args, { cwd: repository, encoding: "buffer" });
      return { stdout: new Uint8Array(result.stdout), stderr: new Uint8Array(result.stderr) };
    };
    const accepted = await proveGitDeliveryContribution({
      exec,
      before: { predecessor: await coordinate(base), member: await coordinate(beforeMember) },
      after: { predecessor: await coordinate(afterPredecessor), member: await coordinate(afterMember) },
    });
    expect(accepted).toEqual({ status: "accepted", proof: "mechanical-reapply" });

    await writeFile(join(repository, "feature.txt"), "feature changed\n", "utf8");
    await run(["add", "feature.txt"]);
    await run(["commit", "-m", "change feature"]);
    const changed = await run(["rev-parse", "HEAD"]);
    await expect(proveGitDeliveryContribution({
      exec,
      before: { predecessor: await coordinate(base), member: await coordinate(beforeMember) },
      after: { predecessor: await coordinate(afterPredecessor), member: await coordinate(changed) },
    })).resolves.toEqual({
      status: "refused",
      reason: "contribution-diverged",
      paths: ["feature.txt"],
    });
  });

  it("refuses a conflicted reapply with the conflicted paths", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-delivery-contribution-conflict-" });
    roots.push(repository);
    const run = async (args: string[]): Promise<string> => (
      await execFileAsync("git", args, { cwd: repository })
    ).stdout.trim();
    const coordinate = async (head: string) => ({ head, tree: await run(["rev-parse", `${head}^{tree}`]) });
    await writeFile(join(repository, "shared.txt"), "base\n", "utf8");
    await run(["add", "shared.txt"]);
    await run(["commit", "-m", "base"]);
    const base = await run(["rev-parse", "HEAD"]);
    await run(["checkout", "-b", "before-conflict"]);
    await writeFile(join(repository, "shared.txt"), "member\n", "utf8");
    await run(["commit", "-am", "member"]);
    const beforeMember = await run(["rev-parse", "HEAD"]);

    await run(["checkout", "-b", "after-conflict", base]);
    await writeFile(join(repository, "shared.txt"), "ambient\n", "utf8");
    await run(["commit", "-am", "ambient"]);
    const afterPredecessor = await run(["rev-parse", "HEAD"]);
    const exec: RawGitExec = async (args) => {
      const result = await execFileAsync("git", args, { cwd: repository, encoding: "buffer" });
      return { stdout: new Uint8Array(result.stdout), stderr: new Uint8Array(result.stderr) };
    };

    await expect(proveGitDeliveryContribution({
      exec,
      before: { predecessor: await coordinate(base), member: await coordinate(beforeMember) },
      after: { predecessor: await coordinate(afterPredecessor), member: await coordinate(afterPredecessor) },
    })).resolves.toEqual({
      status: "refused",
      reason: "contribution-conflicted",
      paths: ["shared.txt"],
    });
  });

  it("judges a member merge commit by its tree", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-delivery-contribution-merge-" });
    roots.push(repository);
    const run = async (args: string[]): Promise<string> => (
      await execFileAsync("git", args, { cwd: repository })
    ).stdout.trim();
    const coordinate = async (head: string) => ({ head, tree: await run(["rev-parse", `${head}^{tree}`]) });
    await writeFile(join(repository, "base.txt"), "base\n", "utf8");
    await run(["add", "base.txt"]);
    await run(["commit", "-m", "base"]);
    const base = await run(["rev-parse", "HEAD"]);
    await run(["checkout", "-b", "side", base]);
    await writeFile(join(repository, "side.txt"), "side\n", "utf8");
    await run(["add", "side.txt"]);
    await run(["commit", "-m", "side"]);
    const side = await run(["rev-parse", "HEAD"]);
    await run(["checkout", "-b", "member-merge", base]);
    await writeFile(join(repository, "feature.txt"), "feature\n", "utf8");
    await run(["add", "feature.txt"]);
    await run(["commit", "-m", "feature"]);
    await run(["merge", "--no-ff", "-m", "merge side", side]);
    const beforeMember = await run(["rev-parse", "HEAD"]);

    await run(["checkout", "-b", "after-merge", base]);
    await writeFile(join(repository, "ambient.txt"), "ambient\n", "utf8");
    await run(["add", "ambient.txt"]);
    await run(["commit", "-m", "ambient"]);
    const afterPredecessor = await run(["rev-parse", "HEAD"]);
    const reappliedTree = await run([
      "merge-tree", "--write-tree", "--merge-base", base, afterPredecessor, beforeMember,
    ]);
    const afterMember = await run(["commit-tree", reappliedTree, "-p", afterPredecessor, "-m", "provider"]);
    const exec: RawGitExec = async (args) => {
      const result = await execFileAsync("git", args, { cwd: repository, encoding: "buffer" });
      return { stdout: new Uint8Array(result.stdout), stderr: new Uint8Array(result.stderr) };
    };

    await expect(proveGitDeliveryContribution({
      exec,
      before: { predecessor: await coordinate(base), member: await coordinate(beforeMember) },
      after: { predecessor: await coordinate(afterPredecessor), member: await coordinate(afterMember) },
    })).resolves.toEqual({ status: "accepted", proof: "mechanical-reapply" });
  });
});
