/** Base-resolution refusals raised while reading a reviewed Candidate's lineage. */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { GitExec } from "../../src/lib/git/exec.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { createRespondDependencies } from
  "../../src/scripts/review-gate/runtime/respond-composition.js";

const roots: string[] = [];
const exec = createExecaGitExec();

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await exec("git", args, { cwd })).stdout.trim();
}

function boundExec(cwd: string): GitExec {
  return async (command, args, options) => exec(command, args, { ...options, cwd: options?.cwd ?? cwd });
}

/**
 * Build the one history that leaves two best common ancestors with neither reachable from the other.
 *
 * Two merges of the same pair in opposite parent orders. No single revision then defines what the branch
 * contributes, which is the condition every reader on this path has to refuse rather than pick through.
 */
async function ambiguousBaseRepository(): Promise<{ root: string; head: string }> {
  const root = await mkdtemp(join(tmpdir(), "arc-respond-lineage-"));
  roots.push(root);
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "ARC Test");
  await git(root, "config", "user.email", "arc@example.test");
  await writeFile(join(root, "tracked.txt"), "initial\n", "utf8");
  await git(root, "add", "tracked.txt");
  await git(root, "commit", "-m", "initial");
  await git(root, "switch", "-c", "feature");
  await writeFile(join(root, "feature.txt"), "feature\n", "utf8");
  await git(root, "add", "feature.txt");
  await git(root, "commit", "-m", "feature side");
  const featureSide = await git(root, "rev-parse", "HEAD");
  await git(root, "switch", "main");
  await writeFile(join(root, "base.txt"), "base\n", "utf8");
  await git(root, "add", "base.txt");
  await git(root, "commit", "-m", "base side");
  const baseSide = await git(root, "rev-parse", "HEAD");
  await git(root, "switch", "feature");
  await git(root, "merge", "--no-ff", "-m", "feature merge", baseSide);
  await git(root, "switch", "main");
  await git(root, "merge", "--no-ff", "-m", "base merge", featureSide);
  await git(root, "switch", "feature");
  return { root, head: await git(root, "rev-parse", "HEAD") };
}

describe("reading a reviewed Candidate's lineage", () => {
  it("refuses a target whose base is not a single coordinate as invalid input", async () => {
    const { root, head } = await ambiguousBaseRepository();
    const dependencies = createRespondDependencies({ cwd: root, exec: boundExec(root) });

    // An anonymous raise here reaches the command boundary as an unexplained failure with no diagnostics, so
    // the operator is told the respond failed and nothing about the history that stopped it. Under the stable
    // invalid-input type the boundary already reports, it arrives as the repository precondition it is.
    await expect(dependencies.readCandidateLineage({ headSha: head } as never))
      .rejects.toMatchObject({ code: "invalid-input", reason: "ambiguous-merge-base" });
  }, 60_000);
});
