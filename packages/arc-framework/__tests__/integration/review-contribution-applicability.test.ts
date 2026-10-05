/** Review contribution applicability against real Git topology. */

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { handleCandidateApplicabilityResolve } from "../../src/handlers/candidate.js";
import type { RawGitExec } from "../../src/lib/git/exec.js";
import { createRawGitExec, gitExec } from "../../src/lib/io-context.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { canonicalDigest } from "../../src/lib/kernel/canonical/canonical-json.js";
import { CanonicalDigestSchema } from "../../src/lib/kernel/schema/vocabulary.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import {
  candidateReviewApplicabilitySelections,
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
} from "../../src/lib/work-unit/candidate-attestation.js";
import {
  readCandidateRecordVersioned,
  resolveCandidateRecordRelativePath,
  writeCandidateRecord,
} from "../../src/lib/work-unit/candidate-record-store.js";
import { readGitCandidateTargetBase } from "../../src/lib/work-unit/git-candidate-effective-target.js";
import { createReviewRequest, createReviewRequirement, createReviewTarget } from
  "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { LocalReviewOperationStateStore } from
  "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { resolveRepositoryIdentity } from "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import { acknowledgeHostedRequest, recordHostedAwaitAttempt, recordHostedRequestAdmission } from
  "../../src/scripts/review-gate/lane-progress.js";
import { createStandardReviewReservation } from
  "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { createHostedReservationDischargeReader } from
  "../../src/scripts/review-gate/policy/hosted-reservation-discharge.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "../../src/scripts/review-gate/policy/standard-review.js";
import { projectGitReviewContributionApplicability } from
  "../../src/scripts/review-gate/policy/git-review-contribution-applicability.js";
import {
  gitCandidateRecordAtHead,
  projectMechanicalReviewApplicabilityCarry,
} from "../../src/scripts/review-gate/policy/mechanical-review-applicability-carry.js";
import { reduceReviewApplicabilityAuthorityWithMechanicalCarry } from
  "../../src/scripts/review-gate/policy/review-applicability-authority.js";
import type { ReviewContributionApplicabilitySelector } from
  "../../src/scripts/review-gate/policy/review-contribution-applicability.js";
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
      deliverableId: CanonicalDigestSchema.parse(`sha256:${"9".repeat(64)}`),
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

describe("singleton review applicability through the selection command", () => {
  // A reviewed feature commit, then an unreviewed notes commit, on a branch whose configured base has since
  // advanced past work the branch never touched.
  async function singletonBehindBase(reviewNotes = false) {
    const root = await createTempRepoCore({ prefix: "arc-singleton-applicability-" });
    roots.push(root);
    const run = async (args: string[]): Promise<string> => (
      await execFileAsync("git", args, { cwd: root })
    ).stdout.trim();
    const commit = async (path: string, content: string, message: string): Promise<string> => {
      await writeFile(join(root, path), content, "utf8");
      await run(["add", path]);
      await run(["commit", "-m", message]);
      return run(["rev-parse", "HEAD"]);
    };

    const mergeBase = await commit("root.txt", "root\n", "root");
    await run(["checkout", "-b", "feat/example"]);

    const subject = createCandidateSubjectSnapshot([{
      path: "feature.txt",
      mode: "100644",
      digest: canonicalDigest({ source: "feature" }),
      treatment: "reviewable",
    }]);
    const attestation = createCandidateAttestation({
      workUnit: "example",
      subject,
      baseRevision: mergeBase,
      attestedBy: "andrew",
      attestedAt: "2026-10-02T12:00:00.000Z",
      verificationEvidenceRef: "verification://example",
    });
    await writeCandidateRecord(root, "example", {
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation,
      subject,
      transitions: [],
      lineageAttestations: [],
    }, null);
    await run(["add", resolveCandidateRecordRelativePath("example")]);
    const featureHead = await commit("feature.txt", "feature\n", "reviewed feature");
    const notesHead = await commit("notes.md", "# Notes\n", "add notes");
    const reviewedHead = reviewNotes ? notesHead : featureHead;
    await run(["checkout", "main"]);
    const baseTip = await commit("base.txt", "unrelated\n", "unrelated base movement");
    await run(["update-ref", "refs/remotes/origin/main", baseTip]);
    await run(["checkout", "feat/example"]);

    // The offer binds the head's merge base with the configured base, the base its review covers.
    const project = (selector: ReviewContributionApplicabilitySelector) => projectGitReviewContributionApplicability({
      selector,
      exec: createRawGitExec(root),
      observeEndpoints: async () => ({ head: selector.currentHead, base: selector.currentBase }),
    });
    const projectAt = async (currentHead: string) => {
      const base = await readGitCandidateTargetBase({
        cwd: root,
        revision: currentHead,
        baseBranch: "main",
        exec: gitExec,
      });
      if (base.status !== "resolved") throw new Error("expected a sole merge base");
      return project({
        schemaVersion: 1,
        repositoryId: "repository-1",
        repository: "owner/repository",
        pullRequest: 42,
        lane: "standard",
        sourceId: "coderabbit-pr",
        priorAttemptId: "attempt-prior",
        priorHead: reviewedHead,
        currentHead,
        priorBase: mergeBase,
        currentBase: base.base,
      });
    };
    // Status's reading of the recorded authority over the prior review at a head.
    const authorityAt = async (currentHead: string) => {
      const projection = await projectAt(currentHead);
      const { record } = await readCandidateRecordVersioned(root, "example");
      if (record === null) throw new Error("expected the Candidate record");
      const selections = candidateReviewApplicabilitySelections(record);
      const carried = projection.state !== "decision-required"
        ? []
        : await projectMechanicalReviewApplicabilityCarry({
            candidateId: attestation.candidateId,
            projection,
            selections,
            projectSelector: project,
            ownRecord: gitCandidateRecordAtHead(createRawGitExec(root), "example"),
          });
      return reduceReviewApplicabilityAuthorityWithMechanicalCarry(
        attestation.candidateId,
        projection,
        selections,
        carried,
      );
    };
    const offer = async (currentHead: string) => {
      const projection = await projectAt(currentHead);
      const { version } = await readCandidateRecordVersioned(root, "example");
      return {
        schemaVersion: 1,
        kind: "review-applicability-selection",
        workUnitId: "example",
        expectedRecordVersion: version,
        candidateId: attestation.candidateId,
        projection,
        choices: ["covered", "review-required"],
        interactionText: "Is the residual covered by the earlier review?",
      };
    };
    const select = async (selectionOffer: unknown, selectedAt: string) => {
      const output: string[] = [];
      const exitCodes: number[] = [];
      await handleCandidateApplicabilityResolve("example", "-", undefined, {
        resolveRoot: () => root,
        resolveMutationOwner: async () => ({ status: "owned", workUnit: "example" }),
        readText: async () => JSON.stringify({
          kind: "review-applicability-selection",
          offer: selectionOffer,
          selection: { selectedBy: "andrew", selectedAt, choice: "covered" },
        }),
        write: (text) => output.push(text),
        setExitCode: (code) => exitCodes.push(code),
      });
      return { result: JSON.parse(output.join("")) as unknown, exitCodes };
    };
    return { root, run, commit, mergeBase, reviewedHead, notesHead, baseTip, offer, select, authorityAt };
  }

  async function recordCleanHostedReview(fixture: Awaited<ReturnType<typeof singletonBehindBase>>) {
    const publisher = new RepositoryGitCommonStatePublisher(gitExec, fixture.root);
    const repositoryId = await resolveRepositoryIdentity(publisher);
    const store = new LocalReviewOperationStateStore(publisher);
    const { record } = await readCandidateRecordVersioned(fixture.root, "example");
    if (record === null) throw new Error("expected Candidate record");
    const target = { repository: "owner/repository", pullRequest: 42, headSha: fixture.reviewedHead };
    const reviewTarget = createReviewTarget({
      schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set", repositoryId,
      baseRef: "main", diffBaseSha: fixture.mergeBase,
      diffBaseTree: await fixture.run(["rev-parse", `${fixture.mergeBase}^{tree}`]),
      headSha: fixture.reviewedHead,
      headTree: await fixture.run(["rev-parse", `${fixture.reviewedHead}^{tree}`]),
    });
    const obligation = {
      obligation: "required" as const, reasons: ["sensitive-change-set" as const],
      rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
      rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
      retrigger: "full-final" as const, count: 1 as const,
    };
    const requirement = createReviewRequirement({
      target: reviewTarget, projection: obligation,
      acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }], initialAdmission: "automatic",
    });
    if (requirement === null) throw new Error("expected review requirement");
    const admitted = await recordHostedRequestAdmission(store, {
      repositoryId, lineage: { kind: "candidate", candidateId: record.attestation.candidateId },
      request: { schemaVersion: 1, target, provider: "codex-pr", coverage: "complete" },
      reviewTarget, requirement, actorIdentity: "test-reviewer",
      authorizeCapacity: async () => undefined, now: "2026-10-02T12:00:00.000Z",
    });
    if (admitted.state !== "admitted") throw new Error("expected hosted admission");
    const handle = {
      schemaVersion: 1 as const, provider: "codex-pr" as const,
      requestedCoverage: "complete" as const, effectiveCoverage: "complete" as const, target,
      artifact: { kind: "issue-comment" as const, id: "request-1", url: "https://example.test/request-1",
        createdAt: "2026-10-02T12:00:00.000Z" },
      admission: admitted.admission,
    };
    await acknowledgeHostedRequest(store, { admission: admitted.admission, handle, now: handle.artifact.createdAt });
    await recordHostedAwaitAttempt(store, {
      repositoryId,
      result: { schemaVersion: 1, mode: "review-hosted-await", handle, state: "clean", nextAction: "complete",
        reviewUrl: "https://example.test/clean-1" },
      now: "2026-10-02T12:00:30.000Z",
    });
    return createStandardReviewReservation({
      candidateId: record.attestation.candidateId, sourceId: "codex-pr", sources: ["codex-pr"],
      repository: target.repository, headSha: fixture.reviewedHead, obligation,
    });
  }

  it.each(["lagging local branch", "local-only base"] as const)(
    "keeps hosted freshness aligned after the base absorbs review (%s)",
    async (baseMode) => {
      const fixture = await singletonBehindBase();
      const reservation = await recordCleanHostedReview(fixture);
      await fixture.run(["checkout", "main"]);
      await fixture.run(["merge", "--no-ff", "--no-edit", fixture.reviewedHead]);
      const absorbingBase = await fixture.run(["rev-parse", "HEAD"]);
      await fixture.run(["update-ref", "refs/remotes/origin/main", absorbingBase]);
      await fixture.run(["checkout", "feat/example"]);
      if (baseMode === "lagging local branch") {
        await fixture.run(["update-ref", "refs/heads/main", fixture.mergeBase]);
        expect(await fixture.run(["merge-base", fixture.notesHead, "main"])).toBe(fixture.mergeBase);
      } else {
        await fixture.run(["update-ref", "-d", "refs/remotes/origin/main"]);
      }
      const reader = createHostedReservationDischargeReader({
        cwd: fixture.root, exec: gitExec,
        host: { readRequest: async (repository, binding) => ({
          status: "observed", request: { repository, binding, headRepository: repository,
            headRef: "feat/example", headSha: await fixture.run(["rev-parse", "HEAD"]),
            baseRef: "main", state: "open", draft: false },
        }) },
      });
      const read = async () => {
        const head = await fixture.run(["rev-parse", "HEAD"]);
        const base = await readGitCandidateTargetBase({
          cwd: fixture.root, revision: head, baseBranch: "main", exec: gitExec,
        });
        if (base.status !== "resolved") throw new Error("expected sole base");
        expect(base.base).toBe(fixture.reviewedHead);
        const { record } = await readCandidateRecordVersioned(fixture.root, "example");
        if (record === null) throw new Error("expected Candidate record");
        return reader({ reservation, approvedHead: head, baseRevision: base.base,
          changeRequest: { repository: "owner/repository", pullRequest: 42 }, candidate: record });
      };
      const residual = await read();
      expect(residual, JSON.stringify(residual)).toMatchObject({
        discharged: false, nextSource: null, applicabilityAuthority: "decision-required",
        applicability: { state: "decision-required", paths: ["notes.md"],
          selector: { currentHead: fixture.notesHead, currentBase: fixture.reviewedHead } },
      });
      const offer = { ...await fixture.offer(fixture.notesHead), projection: residual.applicability };
      await expect(fixture.select(offer, "2026-10-02T12:01:00.000Z")).resolves.toEqual({
        result: expect.objectContaining({ state: "resolved", nextAction: "commit-selection", choice: "covered" }),
        exitCodes: [],
      });
      await fixture.run(["commit", "-m", "retain residual review"]);
      await expect(read()).resolves.toMatchObject({ discharged: true, nextSource: null });
    },
  );

  it.each(["materialized upstream", "local fallback"] as const)(
    "retains covered singleton review against a selected custom remote (%s)",
    async (baseMode) => {
      const fixture = await singletonBehindBase(true);
      const reservation = await recordCleanHostedReview(fixture);
      const absorbedHead = await fixture.run(["rev-parse", `${fixture.notesHead}^`]);
      await fixture.run(["checkout", "main"]);
      await fixture.run(["merge", "--no-ff", "--no-edit", absorbedHead]);
      const absorbingBase = await fixture.run(["rev-parse", "HEAD"]);
      if (baseMode === "materialized upstream") {
        await fixture.run(["update-ref", "refs/remotes/upstream/main", absorbingBase]);
        await fixture.run(["update-ref", "refs/heads/main", fixture.mergeBase]);
      }
      await fixture.run(["checkout", "feat/example"]);
      const reader = createHostedReservationDischargeReader({
        cwd: fixture.root, exec: gitExec, remote: "upstream",
        host: { readRequest: async (repository, binding) => ({
          status: "observed", request: { repository, binding, headRepository: repository,
            headRef: "feat/example", headSha: fixture.notesHead,
            baseRef: "main", state: "open", draft: false },
        }) },
      });
      const { record } = await readCandidateRecordVersioned(fixture.root, "example");
      if (record === null) throw new Error("expected Candidate record");
      const read = () => reader({ reservation, approvedHead: fixture.notesHead,
        baseRevision: absorbedHead, changeRequest: { repository: "owner/repository", pullRequest: 42 },
        candidate: record });
      const retained = await read();
      expect(retained, JSON.stringify(retained)).toMatchObject({ discharged: true, nextSource: null });
      if (baseMode === "materialized upstream") {
        await fixture.run(["update-ref", "refs/remotes/upstream/main", fixture.mergeBase]);
        await expect(read()).resolves.toMatchObject({
          discharged: false, applicability: { state: "rerun-checkpoint", reason: "base-moved" },
        });
        await fixture.run(["update-ref", "refs/remotes/upstream/main", absorbingBase]);
        await expect(read()).resolves.toMatchObject({ discharged: true, nextSource: null });
      }
    },
  );

  it("binds a covered residual while the base moves past unrelated work, after refusing a moved head", async () => {
    const fixture = await singletonBehindBase();
    const earlier = await fixture.offer(fixture.notesHead);
    expect(earlier.projection).toMatchObject({ state: "decision-required", paths: ["notes.md"] });

    const movedHead = await fixture.commit("notes.md", "# Notes\n\nMore.\n", "extend notes");
    await expect(fixture.select(earlier, "2026-10-02T12:01:00.000Z")).resolves.toEqual({
      result: expect.objectContaining({
        state: "projection-failed",
        nextAction: "return-to-projection",
        reason: "decision-no-longer-required",
        projection: expect.objectContaining({
          reason: "head-moved",
          observed: { head: movedHead, base: fixture.mergeBase },
        }),
      }),
      exitCodes: [1],
    });

    const current = await fixture.offer(movedHead);
    expect(current.projection).toMatchObject({ state: "decision-required", paths: ["notes.md"] });
    await expect(fixture.select(current, "2026-10-02T12:02:00.000Z")).resolves.toEqual({
      result: expect.objectContaining({ state: "resolved", nextAction: "commit-selection", choice: "covered" }),
      exitCodes: [],
    });
    const { record } = await readCandidateRecordVersioned(fixture.root, "example");
    expect(record?.transitions).toEqual([
      expect.objectContaining({ transitionKind: "review-applicability-selection", choice: "covered" }),
    ]);
  });

  it("keeps a covered selection across the commit recording it, and re-asks once reviewed content changes", async () => {
    const fixture = await singletonBehindBase();
    const selected = await fixture.offer(fixture.notesHead);
    await expect(fixture.select(selected, "2026-10-02T12:01:00.000Z")).resolves.toEqual({
      result: expect.objectContaining({ state: "resolved", nextAction: "commit-selection", choice: "covered" }),
      exitCodes: [],
    });
    await fixture.run(["commit", "-m", "record the review applicability selection"]);
    const recordHead = await fixture.run(["rev-parse", "HEAD"]);

    const recorded = await fixture.authorityAt(recordHead);
    expect(recorded).toMatchObject({ state: "applicable", authority: "owner-covered" });
    expect(recorded.projection).toMatchObject({
      paths: [resolveCandidateRecordRelativePath("example"), "notes.md"],
    });

    const changedHead = await fixture.commit("feature.txt", "feature changed\n", "change reviewed feature");
    await expect(fixture.authorityAt(changedHead)).resolves.toMatchObject({ state: "decision-required" });
  });

  it("keeps an interaction selection across its record commit without covering later content changes", async () => {
    const fixture = await singletonBehindBase(true);
    await fixture.run(["checkout", "main"]);
    const movedBase = await fixture.commit("notes.md", "# Base notes\n", "change base notes");
    await fixture.run(["update-ref", "refs/remotes/origin/main", movedBase]);
    await fixture.run(["checkout", "feat/example"]);
    await fixture.run(["merge", "--no-ff", "--no-edit", "-X", "theirs", "main"]);
    const mergedHead = await fixture.run(["rev-parse", "HEAD"]);
    const selected = await fixture.offer(mergedHead);
    expect(selected.projection).toMatchObject({
      state: "decision-required", verdict: "interaction", paths: ["notes.md"],
    });
    await expect(fixture.select(selected, "2026-10-02T12:01:00.000Z")).resolves.toEqual({
      result: expect.objectContaining({ state: "resolved", nextAction: "commit-selection", choice: "covered" }),
      exitCodes: [],
    });
    await fixture.run(["commit", "-m", "record interaction selection"]);
    const recordedHead = await fixture.run(["rev-parse", "HEAD"]);
    await expect(fixture.authorityAt(recordedHead)).resolves.toMatchObject({
      state: "applicable", authority: "owner-covered",
      projection: { verdict: "interaction", paths: ["notes.md"] },
    });
    const changedHead = await fixture.commit("feature.txt", "feature changed\n", "change reviewed feature");
    await expect(fixture.authorityAt(changedHead)).resolves.toMatchObject({ state: "decision-required" });
  });

  it("refuses a selection once the base takes in the reviewed commit, then binds the re-derived residual", async () => {
    const fixture = await singletonBehindBase();
    const earlier = await fixture.offer(fixture.notesHead);

    await fixture.run(["checkout", "main"]);
    await fixture.run(["merge", "--no-ff", "--no-edit", fixture.reviewedHead]);
    const absorbingBase = await fixture.run(["rev-parse", "HEAD"]);
    await fixture.run(["update-ref", "refs/remotes/origin/main", absorbingBase]);
    await fixture.run(["checkout", "feat/example"]);
    await expect(fixture.select(earlier, "2026-10-02T12:01:00.000Z")).resolves.toEqual({
      result: expect.objectContaining({
        state: "projection-failed",
        reason: "decision-no-longer-required",
        projection: expect.objectContaining({
          reason: "base-moved",
          observed: { head: fixture.notesHead, base: fixture.reviewedHead },
        }),
      }),
      exitCodes: [1],
    });

    const current = await fixture.offer(fixture.notesHead);
    expect(current.projection).toMatchObject({ state: "decision-required", paths: ["notes.md"] });
    await expect(fixture.select(current, "2026-10-02T12:02:00.000Z")).resolves.toEqual({
      result: expect.objectContaining({ state: "resolved", choice: "covered" }),
      exitCodes: [],
    });
  });
});
