/** Candidate applicability projection against real Git topology. */

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import type { RawGitExec } from "../../src/lib/change-facts.js";
import { canonicalDigest } from "../../src/lib/canonical/canonical-json.js";
import { createCandidateSubjectSnapshot } from "../../src/lib/work-unit/candidate-attestation.js";
import { projectGitCandidateApplicability } from "../../src/lib/work-unit/git-candidate-applicability.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => removeGitBackedDir(root)));
});

function subject(source: string) {
  return createCandidateSubjectSnapshot([{
    path: "packages/arc-framework/src/example.ts",
    mode: "100644",
    digest: canonicalDigest({ source }),
    treatment: "reviewable",
  }]);
}

describe("Candidate applicability against Git", () => {
  it("rederives one durable baseline through first and successive base carries", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-candidate-applicability-" });
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
    const baselineBase = await run(["rev-parse", "HEAD"]);

    await run(["checkout", "-b", "candidate-baseline"]);
    await writeFile(join(repository, "feature.txt"), "feature\n", "utf8");
    await run(["add", "feature.txt"]);
    await run(["commit", "-m", "feature"]);
    const baselineHead = await run(["rev-parse", "HEAD"]);

    await run(["checkout", "-b", "base-line", baselineBase]);
    await writeFile(join(repository, "base-one.txt"), "one\n", "utf8");
    await run(["add", "base-one.txt"]);
    await run(["commit", "-m", "base one"]);
    const firstBase = await run(["rev-parse", "HEAD"]);

    await run(["checkout", "-b", "candidate-first", baselineHead]);
    await run(["merge", "--no-ff", "--no-edit", firstBase]);
    const firstHead = await run(["rev-parse", "HEAD"]);

    await run(["checkout", "base-line"]);
    await writeFile(join(repository, "base-two.txt"), "two\n", "utf8");
    await run(["add", "base-two.txt"]);
    await run(["commit", "-m", "base two"]);
    const secondBase = await run(["rev-parse", "HEAD"]);

    await run(["checkout", "-b", "candidate-second", firstHead]);
    await run(["merge", "--no-ff", "--no-edit", secondBase]);
    const secondHead = await run(["rev-parse", "HEAD"]);

    const candidateId = canonicalDigest({ candidate: "base-carries" });
    const baselineTarget = { revision: baselineHead, subject: subject("baseline") };
    for (const [currentBase, currentHead] of [
      [firstBase, firstHead],
      [secondBase, secondHead],
    ] as const) {
      const projected = await projectGitCandidateApplicability({
        request: {
          candidateId,
          baselineTarget,
          currentTarget: { revision: currentHead, subject: subject(currentHead) },
          currentBase,
        },
        exec,
        observeEndpoints: async () => ({ candidateHead: currentHead, baseHead: currentBase }),
      });
      expect(projected).toMatchObject({
        state: "applicable",
        nextAction: "recognize-current",
        proof: "mechanical-reapply",
        projection: {
          before: { predecessor: { head: baselineBase }, member: { head: baselineHead } },
          after: { predecessor: { head: currentBase }, member: { head: currentHead } },
        },
      });
    }
  });
});
