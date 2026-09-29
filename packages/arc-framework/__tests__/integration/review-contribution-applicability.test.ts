/** Review contribution applicability against real Git topology. */

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import type { RawGitExec } from "../../src/lib/git/exec.js";
import { canonicalDigest } from "../../src/lib/kernel/canonical/canonical-json.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { createReviewRequest, createReviewRequirement } from
  "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { projectGitReviewContributionApplicability } from
  "../../src/scripts/review-gate/policy/git-review-contribution-applicability.js";
import { confirmDeliveryMemberIncrementalApplicability } from
  "../../src/scripts/review-gate/policy/local-review-coverage-selection.js";
import { composeDeliveryMemberTarget } from
  "../../src/scripts/review-gate/hosts/local/repository-target.js";
import type { ReviewResult } from
  "../../src/scripts/review-gate/core/review-result.js";
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

    await run(["checkout", "--orphan", "unrelated-base"]);
    await run(["rm", "-rf", "."]);
    await writeFile(join(repository, "unrelated.txt"), "unrelated base\n", "utf8");
    await run(["add", "unrelated.txt"]);
    await run(["commit", "-m", "unrelated base"]);
    const unrelatedBase = await run(["rev-parse", "HEAD"]);
    await expect(projectGitReviewContributionApplicability({
      selector: { ...selector(priorHead), currentBase: unrelatedBase },
      exec,
      observeEndpoints: async () => ({ head: priorHead, base: unrelatedBase }),
    })).resolves.toMatchObject({
      state: "decision-required",
      baseMoved: true,
      contributionChanged: true,
    });
  });

  it("validates a private member through the production Git target observer", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-member-applicability-" });
    roots.push(repository);
    const run = async (args: string[]): Promise<string> => (
      await execFileAsync("git", args, { cwd: repository })
    ).stdout.trim();
    const rawExec: RawGitExec = async (args) => {
      const output = await execFileAsync("git", args, { cwd: repository, encoding: "buffer" });
      return { stdout: new Uint8Array(output.stdout), stderr: new Uint8Array(output.stderr) };
    };
    const gitExec = async (_command: string, args: string[]) => {
      const output = await execFileAsync("git", args, { cwd: repository });
      return { stdout: output.stdout, stderr: output.stderr };
    };
    await writeFile(join(repository, "root.txt"), "root\n", "utf8");
    await run(["add", "root.txt"]);
    await run(["commit", "-m", "root"]);
    const priorBase = await run(["rev-parse", "HEAD"]);
    await run(["checkout", "-b", "reviewed"]);
    await writeFile(join(repository, "feature.txt"), "feature\n", "utf8");
    await run(["add", "feature.txt"]);
    await run(["commit", "-m", "reviewed member"]);
    const priorHead = await run(["rev-parse", "HEAD"]);
    await run(["checkout", "-b", "base-line", priorBase]);
    await writeFile(join(repository, "base.txt"), "base movement\n", "utf8");
    await run(["add", "base.txt"]);
    await run(["commit", "-m", "base movement"]);
    const currentBase = await run(["rev-parse", "HEAD"]);
    await run(["checkout", "-b", "carried", priorHead]);
    await run(["merge", "--no-ff", "--no-edit", currentBase]);
    const carriedHead = await run(["rev-parse", "HEAD"]);
    const repositoryId = "repo-1";
    const baseRef = "main";
    const compose = (base: string, head: string) => composeDeliveryMemberTarget({
      exec: gitExec, cwd: repository, baseRef, repositoryId, member: { base, head },
    });
    const priorTarget = await compose(priorBase, priorHead);
    const currentLineage = {
      kind: "delivery-member" as const,
      planId: "123e4567-e89b-12d3-a456-426614174000",
      deliverableId: `sha256:${"9".repeat(64)}`,
      workUnitId: SlugSchema.parse("member-a"),
    };
    const requirement = createReviewRequirement({
      target: priorTarget,
      projection: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: canonicalDigest({ rubric: "member" }),
        retrigger: "full-final",
        count: 1,
      },
      acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
      initialAdmission: "automatic",
    });
    if (requirement === null) throw new Error("missing member requirement");
    const predecessor: ReviewResult = {
      kind: "attested-local",
      producerId: "member-prior",
      repositoryId,
      target: priorTarget,
      sourceIdentity: "delegated-agent",
      originalOutcome: "clean",
      findings: [],
      resultDigest: canonicalDigest({ result: "member-prior" }),
      admission: {
        lineage: currentLineage,
        logicalPass: 1,
        retryGeneration: 0,
        requestedCoverage: "complete",
        effectiveCoverage: "complete",
        scopeMode: "whole-target",
        policyVersion: requirement.policyVersion,
      },
      vehicle: { kind: "delivery-member", identity: currentLineage.deliverableId },
      receiptRef: "receipts/member-prior",
      localSourceRef: "sources/member-prior",
      requirement,
      request: createReviewRequest(priorTarget, {
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        repositoryId,
        targetId: priorTarget.targetId,
        requirementId: requirement.requirementId,
        carrier: { kind: "local-change-set", adapterId: "delegated-agent", changeRequestId: null },
        authorIdentity: "owner",
        evaluatorIdentity: "reviewer",
        lineageId: canonicalDigest({ lineage: "member" }),
        logicalPass: 1,
        generation: 0,
        requestMechanism: "subagent",
      }),
    };
    const confirm = async (head: string) => {
      const currentTarget = await compose(currentBase, head);
      return confirmDeliveryMemberIncrementalApplicability({
        predecessor,
        currentTarget,
        currentLineage,
        exec: rawExec,
        observeTarget: () => compose(currentBase, head),
      });
    };
    // Private members have no PR selector; exact member targets still support D4 proof.
    await expect(confirm(carriedHead)).resolves.toBe("applicable");
    await writeFile(join(repository, "feature.txt"), "changed feature\n", "utf8");
    await run(["commit", "-am", "change member contribution"]);
    const changedHead = await run(["rev-parse", "HEAD"]);
    await expect(confirm(changedHead)).resolves.toBe("review-required");
  });
});
