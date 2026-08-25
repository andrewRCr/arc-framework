/** Review contribution applicability against real Git topology. */

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import type { RawGitExec } from "../../src/lib/change-facts.js";
import { projectGitReviewContributionApplicability } from
  "../../src/scripts/review-gate/policy/git-review-contribution-applicability.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => removeGitBackedDir(root)));
});

describe("review contribution applicability against Git", () => {
  it("preserves a mechanical base carry and exposes a genuine later residual", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-review-applicability-" });
    roots.push(repository);
    const run = async (args: string[]): Promise<string> => (
      await execFileAsync("git", args, { cwd: repository })
    ).stdout.trim();
    const exec: RawGitExec = async (args) => {
      const output = await execFileAsync("git", args, { cwd: repository, encoding: "buffer" });
      return { stdout: new Uint8Array(output.stdout), stderr: new Uint8Array(output.stderr) };
    };

    await writeFile(join(repository, "root.txt"), "root\n", "utf8");
    await run(["add", "root.txt"]);
    await run(["commit", "-m", "root"]);
    const priorBase = await run(["rev-parse", "HEAD"]);

    await run(["checkout", "-b", "reviewed"]);
    await writeFile(join(repository, "feature.txt"), "feature\n", "utf8");
    await run(["add", "feature.txt"]);
    await run(["commit", "-m", "feature"]);
    const priorHead = await run(["rev-parse", "HEAD"]);

    await run(["checkout", "-b", "base-line", priorBase]);
    await writeFile(join(repository, "base.txt"), "base movement\n", "utf8");
    await run(["add", "base.txt"]);
    await run(["commit", "-m", "base movement"]);
    const currentBase = await run(["rev-parse", "HEAD"]);
    await run(["checkout", "-b", "carried", priorHead]);
    await run(["merge", "--no-ff", "--no-edit", currentBase]);
    const carriedHead = await run(["rev-parse", "HEAD"]);

    const selector = (currentHead: string) => ({
      schemaVersion: 1 as const,
      repositoryId: "repository-1",
      repository: "owner/repository",
      pullRequest: 42,
      lane: "standard" as const,
      sourceId: "codex-pr",
      priorAttemptId: "attempt-prior",
      priorHead,
      currentHead,
      priorBase,
      currentBase,
    });

    await expect(projectGitReviewContributionApplicability({
      selector: selector(carriedHead),
      exec,
      observeEndpoints: async () => ({ head: carriedHead, base: currentBase }),
    })).resolves.toMatchObject({
      state: "applicable",
      proof: "mechanical-reapply",
      baseMoved: true,
      contributionChanged: false,
    });

    await writeFile(join(repository, "feature.txt"), "feature changed\n", "utf8");
    await run(["commit", "-am", "change reviewed contribution"]);
    const changedHead = await run(["rev-parse", "HEAD"]);
    await expect(projectGitReviewContributionApplicability({
      selector: selector(changedHead),
      exec,
      observeEndpoints: async () => ({ head: changedHead, base: currentBase }),
    })).resolves.toMatchObject({
      state: "decision-required",
      nextAction: "request-authority",
      paths: ["feature.txt"],
      baseMoved: true,
      contributionChanged: true,
    });
  });
});
