import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import type { RawGitExec } from "../../src/lib/change-facts.js";
import {
  absorbGitDeliveryChain,
  preflightGitDeliveryChainAbsorption,
} from "../../src/lib/delivery/chain-absorption.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => removeGitBackedDir(root)));
});

async function createAbsorptionFixture(input: { conflict?: boolean } = {}): Promise<{
  repository: string;
  git: (args: string[]) => Promise<string>;
  exec: RawGitExec;
  coordinate: (head: string) => Promise<{ head: string; tree: string }>;
  originalMember: string;
  refreshedMember: string;
  top: string;
}> {
  const repository = await createTempRepoCore({ prefix: "arc-delivery-absorb-" });
  roots.push(repository);
  const git = async (args: string[]): Promise<string> => (
    await execFileAsync("git", args, { cwd: repository })
  ).stdout.trim();
  await writeFile(join(repository, "base.txt"), "base\n", "utf8");
  await writeFile(join(repository, "shared.txt"), "base\n", "utf8");
  await git(["add", "base.txt", "shared.txt"]);
  await git(["commit", "-m", "base"]);
  const base = await git(["rev-parse", "HEAD"]);

  await git(["switch", "-c", "member"]);
  await writeFile(join(repository, "member.txt"), "member\n", "utf8");
  await git(["add", "member.txt"]);
  await git(["commit", "-m", "member"]);
  const originalMember = await git(["rev-parse", "HEAD"]);

  await git(["switch", "-c", "feat/example"]);
  await writeFile(join(repository, "residual.txt"), "residual\n", "utf8");
  if (input.conflict === true) await writeFile(join(repository, "shared.txt"), "top\n", "utf8");
  await git(["add", "residual.txt", "shared.txt"]);
  await git(["commit", "-m", "top residual"]);
  const top = await git(["rev-parse", "HEAD"]);

  await git(["switch", "-c", "moved-base", base]);
  await writeFile(join(repository, "base-movement.txt"), "landed elsewhere\n", "utf8");
  await writeFile(join(repository, "shared.txt"), "moved base\n", "utf8");
  await git(["add", "base-movement.txt", "shared.txt"]);
  await git(["commit", "-m", "move base"]);
  await git(["switch", "-c", "refreshed-member"]);
  await git(["cherry-pick", originalMember]);
  const refreshedMember = await git(["rev-parse", "HEAD"]);
  await git(["switch", "feat/example"]);

  const exec: RawGitExec = async (args) => {
    const result = await execFileAsync("git", args, { cwd: repository, encoding: "buffer" });
    return { stdout: new Uint8Array(result.stdout), stderr: new Uint8Array(result.stderr) };
  };
  const coordinate = async (head: string) => ({ head, tree: await git(["rev-parse", `${head}^{tree}`]) });
  return { repository, git, exec, coordinate, originalMember, refreshedMember, top };
}

describe("delivery chain content absorption", () => {
  it("requires an exact clean checked-out terminal before publication can begin", async () => {
    const fixture = await createAbsorptionFixture();
    const input = {
      exec: fixture.exec,
      topRef: "refs/heads/feat/example",
      top: await fixture.coordinate(fixture.top),
    };

    await expect(preflightGitDeliveryChainAbsorption(input)).resolves.toEqual({ status: "ready" });
    await writeFile(join(fixture.repository, "uncommitted.txt"), "not ready\n", "utf8");
    await expect(preflightGitDeliveryChainAbsorption(input)).resolves.toEqual({
      status: "refused",
      reason: "worktree-dirty",
    });
    expect(await fixture.git(["rev-parse", "HEAD"])).toBe(fixture.top);
  });

  it("uses the recorded prior predecessor as the logical base after a repeated rewrite", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-delivery-repeat-absorb-" });
    roots.push(repository);
    const git = async (args: string[]): Promise<string> => (
      await execFileAsync("git", args, { cwd: repository })
    ).stdout.trim();
    await writeFile(join(repository, "shared.txt"), "base\n", "utf8");
    await writeFile(join(repository, "selected.txt"), "base\n", "utf8");
    await git(["add", "shared.txt", "selected.txt"]);
    await git(["commit", "-m", "base"]);
    const base = await git(["rev-parse", "HEAD"]);

    await git(["switch", "-c", "original-highest"]);
    await writeFile(join(repository, "shared.txt"), "member\n", "utf8");
    await git(["add", "shared.txt"]);
    await git(["commit", "-m", "original highest"]);
    const originalHighest = await git(["rev-parse", "HEAD"]);

    await git(["switch", "-c", "feat/example"]);
    await writeFile(join(repository, "shared.txt"), "terminal\n", "utf8");
    await git(["add", "shared.txt"]);
    await git(["commit", "-m", "terminal residual"]);
    const top = await git(["rev-parse", "HEAD"]);

    await git(["switch", "-c", "selected-fix", base]);
    await writeFile(join(repository, "selected.txt"), "fixed\n", "utf8");
    await git(["add", "selected.txt"]);
    await git(["commit", "-m", "selected fix"]);
    await git(["switch", "-c", "refreshed-highest"]);
    await git(["cherry-pick", originalHighest]);
    const refreshedHighest = await git(["rev-parse", "HEAD"]);
    await git(["switch", "feat/example"]);

    const exec: RawGitExec = async (args) => {
      const result = await execFileAsync("git", args, { cwd: repository, encoding: "buffer" });
      return { stdout: new Uint8Array(result.stdout), stderr: new Uint8Array(result.stderr) };
    };
    const coordinate = async (head: string) => ({ head, tree: await git(["rev-parse", `${head}^{tree}`]) });
    const result = await absorbGitDeliveryChain({
      exec,
      topRef: "refs/heads/feat/example",
      top: await coordinate(top),
      previousHighestMember: await coordinate(originalHighest),
      highestMember: await coordinate(refreshedHighest),
    });

    expect(result.status).toBe("absorbed");
    if (result.status !== "absorbed") return;
    expect(await git(["show", `${result.head}:shared.txt`])).toBe("terminal");
    expect(await git(["show", `${result.head}:selected.txt`])).toBe("fixed");
    expect((await git(["rev-list", "--parents", "-n", "1", result.head])).split(" "))
      .toEqual([result.head, top, refreshedHighest]);
  });

  it("merges refreshed predecessor content while preserving reviewed top ancestry", async () => {
    const fixture = await createAbsorptionFixture();
    const result = await absorbGitDeliveryChain({
      exec: fixture.exec,
      topRef: "refs/heads/feat/example",
      top: await fixture.coordinate(fixture.top),
      previousHighestMember: await fixture.coordinate(fixture.originalMember),
      highestMember: await fixture.coordinate(fixture.refreshedMember),
    });

    expect(result.status).toBe("absorbed");
    if (result.status !== "absorbed") return;
    expect(await fixture.git(["show", `${result.head}:base-movement.txt`])).toBe("landed elsewhere");
    expect(await fixture.git(["show", `${result.head}:residual.txt`])).toBe("residual");
    expect((await fixture.git(["rev-list", "--parents", "-n", "1", result.head])).split(" "))
      .toEqual([result.head, fixture.top, fixture.refreshedMember]);
    expect(await fixture.git(["merge-base", "--is-ancestor", fixture.originalMember, result.head])).toBe("");
    expect(await fixture.git(["merge-base", "--is-ancestor", fixture.top, result.head])).toBe("");

    await expect(absorbGitDeliveryChain({
      exec: fixture.exec,
      topRef: "refs/heads/feat/example",
      top: await fixture.coordinate(fixture.top),
      previousHighestMember: await fixture.coordinate(fixture.originalMember),
      highestMember: await fixture.coordinate(fixture.refreshedMember),
    })).resolves.toEqual(result);
  });

  it("recovers an exact interrupted merge before retrying the absorption", async () => {
    const fixture = await createAbsorptionFixture();
    await fixture.git(["merge", "--no-ff", "--no-commit", fixture.refreshedMember]);
    expect(await fixture.git(["rev-parse", "MERGE_HEAD"])).toBe(fixture.refreshedMember);

    const result = await absorbGitDeliveryChain({
      exec: fixture.exec,
      topRef: "refs/heads/feat/example",
      top: await fixture.coordinate(fixture.top),
      previousHighestMember: await fixture.coordinate(fixture.originalMember),
      highestMember: await fixture.coordinate(fixture.refreshedMember),
    });

    expect(result.status).toBe("absorbed");
    if (result.status !== "absorbed") return;
    expect((await fixture.git(["rev-list", "--parents", "-n", "1", result.head])).split(" "))
      .toEqual([result.head, fixture.top, fixture.refreshedMember]);
    await expect(execFileAsync("git", ["rev-parse", "--verify", "MERGE_HEAD"], { cwd: fixture.repository }))
      .rejects.toThrow();
  });

  it("recovers an exactly prepared merge tree before its branch update", async () => {
    const fixture = await createAbsorptionFixture();
    const mergeTree = await fixture.git([
      "merge-tree",
      "--write-tree",
      "--merge-base", fixture.originalMember,
      "--name-only",
      "-z",
      "--no-messages",
      fixture.top,
      fixture.refreshedMember,
    ]);
    const tree = mergeTree.split("\0")[0];
    if (tree === undefined || tree === "") throw new Error("prepared tree must resolve");
    await fixture.git(["read-tree", "--reset", "-u", tree]);
    expect(await fixture.git(["rev-parse", "HEAD"])).toBe(fixture.top);
    expect(await fixture.git(["status", "--porcelain=v1"])).not.toBe("");

    const result = await absorbGitDeliveryChain({
      exec: fixture.exec,
      topRef: "refs/heads/feat/example",
      top: await fixture.coordinate(fixture.top),
      previousHighestMember: await fixture.coordinate(fixture.originalMember),
      highestMember: await fixture.coordinate(fixture.refreshedMember),
    });

    expect(result.status).toBe("absorbed");
    if (result.status !== "absorbed") return;
    expect(await fixture.git(["status", "--porcelain=v1"])).toBe("");
    expect((await fixture.git(["rev-list", "--parents", "-n", "1", result.head])).split(" "))
      .toEqual([result.head, fixture.top, fixture.refreshedMember]);
  });

  it("surfaces content conflicts for attended resolution and restores the pinned top", async () => {
    const fixture = await createAbsorptionFixture({ conflict: true });
    await expect(absorbGitDeliveryChain({
      exec: fixture.exec,
      topRef: "refs/heads/feat/example",
      top: await fixture.coordinate(fixture.top),
      previousHighestMember: await fixture.coordinate(fixture.originalMember),
      highestMember: await fixture.coordinate(fixture.refreshedMember),
    })).resolves.toEqual({
      status: "refused",
      reason: "content-conflict",
      paths: ["shared.txt"],
    });
    expect(await fixture.git(["rev-parse", "HEAD"])).toBe(fixture.top);
    expect(await fixture.git(["status", "--porcelain=v1"])).toBe("");
    await expect(execFileAsync("git", ["rev-parse", "--verify", "MERGE_HEAD"], { cwd: fixture.repository }))
      .rejects.toThrow();
  });
});
