import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { inspectDeliveryBranch } from "../../src/lib/delivery/from-branch.js";
import { createRawGitExec } from "../../src/lib/io-context.js";
import {
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
} from "../helpers/integration.js";

describe("branch-derived delivery facts", () => {
  let repository: string;
  let originalBase: string;
  let firstContribution: string;
  let baseAdvance: string;
  let ambientMerge: string;
  let head: string;

  beforeEach(async () => {
    repository = await createTempRepo("arc-delivery-branch-");
    await commitFile(repository, "shared.txt", "base\n", "base");
    originalBase = await oid(repository, "HEAD");
    await git(repository, ["checkout", "-b", "feature"]);
    await commitFile(repository, "feature-one.txt", "one\n", "first contribution");
    firstContribution = await oid(repository, "HEAD");
    await git(repository, ["checkout", "main"]);
    await commitFile(repository, "base-only.txt", "advance\n", "base advance");
    baseAdvance = await oid(repository, "HEAD");
    await git(repository, ["checkout", "feature"]);
    await git(repository, ["merge", "--no-ff", "main", "-m", "absorb base"]);
    ambientMerge = await oid(repository, "HEAD");
    await commitFile(repository, "feature-two.txt", "two\n", "second contribution");
    head = await oid(repository, "HEAD");
  });

  afterEach(async () => cleanupTempDir(repository));

  it("finds original divergence and retains an ambient merge as one ordering step", async () => {
    const result = await inspectDeliveryBranch({
      exec: createRawGitExec(repository),
      base: "main",
      head: "HEAD",
    });

    expect(result).toMatchObject({
      status: "inspected",
      base: baseAdvance,
      head,
      originalDivergence: { predecessor: originalBase, commit: firstContribution },
      steps: [
        { commit: firstContribution, predecessor: originalBase, classification: "contribution" },
        { commit: ambientMerge, predecessor: firstContribution, classification: "ambient-base-absorb" },
        { commit: head, predecessor: ambientMerge, classification: "contribution" },
      ],
      contributionStepIds: [firstContribution, head],
    });
    if (result.status !== "inspected") return;
    expect(result.steps[1]?.changeSet).toMatchObject({ changeSet: "known" });
    expect(result.steps[2]?.cumulativePaths).toEqual(["feature-one.txt", "feature-two.txt"]);
  });

  it("uses an explicit historical base line instead of the moving configured base", async () => {
    const result = await inspectDeliveryBranch({
      exec: createRawGitExec(repository),
      base: originalBase,
      head: "HEAD",
    });

    expect(result).toMatchObject({
      status: "inspected",
      base: originalBase,
      steps: [
        { commit: firstContribution, classification: "contribution" },
        { commit: ambientMerge, classification: "contribution" },
        { commit: head, classification: "contribution" },
      ],
    });
  });

  it("refuses missing and non-ancestor boundaries with typed reasons", async () => {
    await expect(inspectDeliveryBranch({
      exec: createRawGitExec(repository),
      base: "HEAD",
      head: "HEAD",
    })).resolves.toEqual({ status: "refused", reason: "divergence-boundary-missing" });

    await git(repository, ["checkout", "--orphan", "disconnected"]);
    await git(repository, ["rm", "-rf", "."]);
    await commitFile(repository, "disconnected.txt", "outside\n", "disconnected");
    await expect(inspectDeliveryBranch({
      exec: createRawGitExec(repository),
      base: "main",
      head: "HEAD",
    })).resolves.toEqual({ status: "refused", reason: "base-not-ancestor" });
  });

  it("refuses a base absorb whose conflict resolution cannot be proved ambient", async () => {
    await git(repository, ["checkout", "main"]);
    await commitFile(repository, "shared.txt", "main resolution\n", "main conflict side");
    await git(repository, ["checkout", "-b", "conflict-feature", originalBase]);
    await commitFile(repository, "shared.txt", "feature resolution\n", "feature conflict side");
    await expect(execFileAsync("git", ["merge", "--no-ff", "main", "-m", "conflicting absorb"], {
      cwd: repository,
    })).rejects.toThrow();
    await writeFile(join(repository, "shared.txt"), "authored resolution\n");
    await git(repository, ["add", "--", "shared.txt"]);
    await git(repository, ["-c", "core.hooksPath=/dev/null", "commit", "-m", "resolve absorb"]);

    await expect(inspectDeliveryBranch({
      exec: createRawGitExec(repository),
      base: "main",
      head: "HEAD",
    })).resolves.toEqual({ status: "refused", reason: "ambient-purity-unproven" });
  });

  it("preserves arbitrary rename endpoints in cumulative contribution shape", async () => {
    const previousPath = "old\nname.txt";
    const nextPath = "new\nname.txt";
    await commitFile(repository, previousPath, "rename me\n", "add hostile path");
    await git(repository, ["mv", previousPath, nextPath]);
    await git(repository, ["-c", "core.hooksPath=/dev/null", "commit", "-m", "rename hostile path"]);

    const result = await inspectDeliveryBranch({
      exec: createRawGitExec(repository),
      base: "main",
      head: "HEAD",
    });
    expect(result.status).toBe("inspected");
    if (result.status !== "inspected") return;
    expect(result.steps.at(-1)?.changeSet).toMatchObject({
      changeSet: "known",
      changes: [{ status: "renamed", previousPath, path: nextPath }],
    });
    expect(result.steps.at(-1)?.cumulativePaths).toContain(previousPath);
    expect(result.steps.at(-1)?.cumulativePaths).toContain(nextPath);
  });
});

async function git(repository: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: repository });
}

async function oid(repository: string, ref: string): Promise<string> {
  return (await execFileAsync("git", ["rev-parse", ref], { cwd: repository })).stdout.trim();
}

async function commitFile(
  repository: string,
  path: string,
  content: string,
  message: string,
): Promise<void> {
  await writeFile(join(repository, path), content);
  await git(repository, ["add", "--", path]);
  await git(repository, ["-c", "core.hooksPath=/dev/null", "commit", "-m", message]);
}
