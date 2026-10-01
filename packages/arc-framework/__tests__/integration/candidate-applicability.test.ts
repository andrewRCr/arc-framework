/** Candidate applicability projection against real Git topology. */

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import type { RawGitExec } from "../../src/lib/git/exec.js";
import { canonicalDigest } from "../../src/lib/kernel/canonical/canonical-json.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
} from "../../src/lib/work-unit/candidate-attestation.js";
import { projectGitCandidateApplicability } from "../../src/lib/work-unit/git-candidate-applicability.js";
import { projectGitCandidateEffectiveTarget } from
  "../../src/lib/work-unit/git-candidate-effective-target.js";
import { collectCandidateSubjectTarget } from "../helpers/candidate-subject.js";
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
  it("returns typed movement when the base advances during a staged-current projection", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-candidate-effective-target-" });
    roots.push(repository);
    const run = async (args: string[]): Promise<string> => (
      await execFileAsync("git", args, { cwd: repository })
    ).stdout.trim();
    const exec: GitExec = async (command, args, options) => {
      const output = await execFileAsync(command, args, { cwd: options?.cwd ?? repository });
      return { stdout: output.stdout, stderr: output.stderr };
    };

    await writeFile(join(repository, "root.txt"), "root\n", "utf8");
    await run(["add", "root.txt"]);
    await run(["commit", "-m", "root"]);
    const baseHead = await run(["rev-parse", "HEAD"]);
    await run(["checkout", "-b", "candidate"]);
    await writeFile(join(repository, "feature.txt"), "feature\n", "utf8");
    await run(["add", "feature.txt"]);
    await run(["commit", "-m", "feature"]);
    const candidateHead = await run(["rev-parse", "HEAD"]);
    const target = await collectCandidateSubjectTarget({
      cwd: repository,
      name: "example",
      baseBranch: "main",
      baseRevision: baseHead,
      revision: candidateHead,
      exec,
    });
    const attestation = createCandidateAttestation({
      workUnit: "example",
      subject: target.subject,
      baseRevision: baseHead,
      attestedBy: "andrew",
      attestedAt: "2026-09-02T12:00:00.000Z",
      verificationEvidenceRef: "verification://staged-current-race",
    });
    const movedBase = "f".repeat(40);
    const racingExec: GitExec = async (command, args, options) => {
      if (args.join(" ") === "for-each-ref --format=%(objectname) refs/remotes/origin/main") {
        return { stdout: "", stderr: "" };
      }
      if (args.join(" ") === "rev-parse --verify main^{commit}") {
        return { stdout: `${movedBase}\n`, stderr: "" };
      }
      return exec(command, args, options);
    };

    await expect(projectGitCandidateEffectiveTarget({
      cwd: repository,
      name: "example",
      baseBranch: "main",
      baseRevision: baseHead,
      record: {
        schemaVersion: 1,
        semanticsVersion: "candidate-attestation/v1",
        attestation,
        subject: target.subject,
        transitions: [],
        lineageAttestations: [],
      },
      exec: racingExec,
      rawExec: async (args) => {
        throw new Error(`Applicability must not run after endpoint movement: ${args.join(" ")}`);
      },
    })).resolves.toMatchObject({
      state: "rerun-checkpoint",
      nextAction: "rerun-checkpoint",
      reason: "base-moved",
      observed: { candidateHead, baseHead: movedBase },
    });
  });

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

describe("Candidate applicability over base movement under a pinned baseline", () => {
  /** A repository plus a runner, since every case here builds its own topology by hand. */
  async function repository(): Promise<{
    run: (args: string[]) => Promise<string>;
    exec: RawGitExec;
    write: (path: string, content: string) => Promise<void>;
  }> {
    const root = await createTempRepoCore({ prefix: "arc-candidate-base-movement-" });
    roots.push(root);
    const run = async (args: string[]): Promise<string> => (
      await execFileAsync("git", args, { cwd: root })
    ).stdout.trim();
    const exec: RawGitExec = async (args) => {
      const output = await execFileAsync("git", [...args], { cwd: root, encoding: "buffer" });
      return { stdout: new Uint8Array(output.stdout), stderr: new Uint8Array(output.stderr) };
    };
    const write = async (path: string, content: string): Promise<void> => {
      await writeFile(join(root, path), content, "utf8");
      await run(["add", path]);
      await run(["commit", "-m", path]);
    };
    return { run, exec, write };
  }

  function request(baselineRevision: string, currentRevision: string, currentBase: string) {
    return {
      candidateId: canonicalDigest({ candidate: "base-movement" }),
      baselineTarget: { revision: baselineRevision, subject: subject("baseline") },
      currentTarget: { revision: currentRevision, subject: subject("current") },
      currentBase,
    };
  }

  it("admits a base that advanced past the pinned baseline", async () => {
    const { run, exec, write } = await repository();
    await write("root.txt", "root\n");
    const rootCommit = await run(["rev-parse", "HEAD"]);
    await run(["checkout", "-b", "candidate"]);
    await write("feature.txt", "feature\n");
    const baselineHead = await run(["rev-parse", "HEAD"]);
    // The base takes the baseline in and keeps going, so the pinned baseline is an ancestor of the base:
    // an append-only advance, and the only movement that leaves exactly one best ancestor by containment.
    await run(["checkout", "-b", "base-line", rootCommit]);
    await write("base-one.txt", "one\n");
    await run(["merge", "--no-ff", "--no-edit", baselineHead]);
    await write("base-two.txt", "two\n");
    const currentBase = await run(["rev-parse", "HEAD"]);
    await run(["checkout", "-b", "candidate-current", baselineHead]);
    await run(["merge", "--no-ff", "--no-edit", currentBase]);
    const currentHead = await run(["rev-parse", "HEAD"]);

    const projected = await projectGitCandidateApplicability({
      request: request(baselineHead, currentHead, currentBase),
      exec,
      observeEndpoints: async () => ({ candidateHead: currentHead, baseHead: currentBase }),
    });

    expect(projected.state).not.toBe("classification-unavailable");
  });

  it("refuses a two-base history with its cardinality and the route that clears it", async () => {
    const { run, exec, write } = await repository();
    await write("root.txt", "root\n");
    const rootCommit = await run(["rev-parse", "HEAD"]);
    await run(["checkout", "-b", "candidate"]);
    await write("feature.txt", "feature\n");
    const branchSide = await run(["rev-parse", "HEAD"]);
    await run(["checkout", "-b", "base-line", rootCommit]);
    await write("base.txt", "base\n");
    const baseSide = await run(["rev-parse", "HEAD"]);
    // Each side merges the other's commit rather than the other's merge, so neither result contains the
    // other and the pair keeps both of them as equally good ancestors.
    await run(["checkout", "candidate"]);
    await run(["merge", "--no-ff", "--no-edit", baseSide]);
    const baselineHead = await run(["rev-parse", "HEAD"]);
    await run(["checkout", "base-line"]);
    await run(["merge", "--no-ff", "--no-edit", branchSide]);
    const currentBase = await run(["rev-parse", "HEAD"]);

    const projected = await projectGitCandidateApplicability({
      request: request(baselineHead, baselineHead, currentBase),
      exec,
      observeEndpoints: async () => ({ candidateHead: baselineHead, baseHead: currentBase }),
    });

    // The four strings the refusal already carried are unchanged; what the pinned pair gains is how many
    // ancestors it has, and the route out — re-baselining, because merging moves neither element of a pair
    // whose baseline is reduced from a durable record.
    expect(projected).toMatchObject({
      state: "classification-unavailable",
      nextAction: "stop",
      reason: "merge-base-ambiguous",
      detail: "Multiple baseline-to-current merge bases are available.",
      mergeBaseCount: 2,
      remedy: {
        kind: "candidate-rebaseline-required",
        text:
          "Re-pin the durable baseline over freshly verified content by rooting a new lineage. No merge clears this pair: both compared elements are fixed, so an append-only merge leaves their two best ancestors where they were.",
      },
    });
  });
});
