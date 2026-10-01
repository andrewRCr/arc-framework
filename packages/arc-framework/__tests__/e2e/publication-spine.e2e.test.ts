/** Real-CLI coverage for publication readiness, ordering recovery, and submission. */

import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  git,
  runArc,
  runArcWithStdin,
} from "./helpers.js";
import { advanceBase, movementPaths } from "../helpers/base-advance.js";
import { createStandardReviewReservation } from
  "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  CandidateManagedRecordV1Schema,
  createCandidateReviewResponseEvidence,
  parseCandidateManagedRecord,
  serializeCandidateManagedRecord,
} from "../../src/lib/work-unit/candidate-attestation.js";
import { collectCandidateSubjectTarget } from "../helpers/candidate-subject.js";
import { canonicalDigest } from "../../src/lib/kernel/canonical/canonical-json.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { gitExec } from "../../src/lib/io-context.js";
import { LocalReviewOperationStateStore } from
  "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import {
  projectCandidateDeltaVerification,
  recordCandidateVerifiedResponse,
} from "../../src/scripts/review-gate/policy/pre-publication-procedure.js";
import { responsePolicyRequest } from "../fixtures/review-response-policy.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

const execFileAsync = promisify(execFile);

/**
 * Origin coordinates that parse as `owner/repo` but reach no host.
 *
 * The change-request resolver needs the repository name; `.invalid` is reserved by RFC 2606, so the
 * ref probe fails at name resolution rather than over the network. The resolver classifies the
 * unreachable host as no open change request — the pre-publication state under test.
 */
const OFFLINE_ORIGIN = "https://arc-fixture.invalid/arc-framework/example.git";
const OFFLINE_ENV = { GIT_TERMINAL_PROMPT: "0" };

const META = makeMetaFixture("example", {
  owner: "test-user", branch: "feat/example", workClass: "Light", priority: "P2",
  taskList: "tasks-example.md", lastCompleted: "verification", nextAction: "verification complete",
});

/** Stage one verified Active work unit on its own branch, ready to propose. */
async function createAttestableRepo(): Promise<string> {
  const repository = await createTempRepo();
  await mkdir(join(repository, ".arc", "system"), { recursive: true });
  await writeFile(join(repository, ".arc", "system", "arc-config.yml"), "branch.base: main\n");
  await writeFile(join(repository, ".gitignore"), ".arc/user/\n");
  await writeFile(join(repository, "README.md"), "# Fixture\n");
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", "base"]);
  await git(repository, ["remote", "add", "origin", OFFLINE_ORIGIN]);
  await git(repository, ["checkout", "-b", "feat/example"]);
  await mkdir(join(repository, ".arc", "active"), { recursive: true });
  await mkdir(join(repository, "src"), { recursive: true });
  await writeFile(join(repository, ".arc", "active", "meta-example.md"), META);
  await writeFile(join(repository, "src", "example.ts"), "export const example = true;\n");
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", "implementation"]);
  await writeFile(
    join(repository, ".arc", "active", "tasks-example.md"),
    "# Task List: Example\n\n- [x] Verification complete\n",
  );
  await git(repository, ["add", ".arc/active/tasks-example.md"]);
  return repository;
}

/** Install the full project surface required by the public local-review carrier. */
async function createAtCapPublicationRepo(): Promise<string> {
  const repository = await createTempRepo("arc-publication-cap-");
  const initialized = await runArc(["init", "--yes", "--name", "example"], repository);
  expect(initialized.exitCode, JSON.stringify(initialized)).toBe(0);
  const configPath = join(repository, ".arc", "system", "arc-config.yml");
  const config = await readFile(configPath, "utf8");
  await writeFile(configPath, config.replace(
    "review.standard_sources: []",
    "review.standard_sources: [delegated-agent]",
  ));
  await git(repository, ["add", ".arc", ".gitignore"]);
  await git(repository, ["commit", "-m", "install ARC"]);
  await git(repository, ["switch", "-c", "feat/example"]);
  await mkdir(join(repository, ".arc", "active"), { recursive: true });
  await mkdir(join(repository, "src"), { recursive: true });
  await writeFile(join(repository, ".arc", "active", "meta-example.md"), META);
  await writeFile(
    join(repository, ".arc", "active", "tasks-example.md"),
    "# Task List: Example\n\n- [x] Verification complete\n",
  );
  await writeFile(join(repository, "src", "example.ts"), "export const example = true;\n");
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", "implementation"]);
  return repository;
}

/** Keep origin reachable while the host reports no PR for this private Candidate. */
async function attachOriginWithoutPr(repository: string): Promise<Record<string, string>> {
  const remote = join(repository, ".git", "fixture-origin.git");
  const bin = join(repository, ".git", "fixture-bin");
  const originUrl = "https://arc-fixture.example/arc-framework/example.git";
  await git(repository, ["init", "--bare", remote]);
  await git(repository, ["remote", "add", "origin", originUrl]);
  await git(repository, ["config", `url.file://${remote}.insteadOf`, originUrl]);
  await mkdir(bin);
  const gh = join(bin, "gh");
  await writeFile(gh, "#!/bin/sh\nprintf '[]\\n'\n");
  await chmod(gh, 0o755);
  return { PATH: `${bin}:${process.env.PATH ?? ""}` };
}

interface ReviewEnvelope {
  state: string;
  nextAction: string;
  payload: Record<string, unknown>;
}

interface LocalReviewPayload {
  operationId: string;
  target: { targetId: string; headSha: string; headTree: string };
  request: { evaluatorIdentity: string };
  reviewerPayload: {
    sourceDigest: string;
    guidanceDigest: string;
    guidance: { rubricVersion: string; rubricDigest: string };
    correctionScope?: {
      predecessorProducerId: string;
      predecessorHeadSha: string;
      basisHeadSha: string;
      headSha: string;
      requiredFindings: readonly { producerId: string; findingId: string; locus: string }[];
    };
    reviewerInstructions?: string;
  };
}

interface FindingsReductionPayload {
  responseSource: { kind: "attested-local"; receiptRef: string };
}

async function invokeReview(
  root: string,
  argv: string[],
  input: unknown,
  env?: Record<string, string>,
): Promise<ReviewEnvelope> {
  const result = await runArcWithStdin(argv, root, `${JSON.stringify(input)}\n`, { env });
  expect(result.exitCode, JSON.stringify(result)).toBe(0);
  return JSON.parse(result.stdout) as ReviewEnvelope;
}

function localPrepareRequest() {
  return {
    schemaVersion: 1,
    evaluatorIdentity: "reviewer-1",
    routingFacts: {
      contentKind: "code-bearing",
      reviewRisk: "routine",
      changeDeterminacy: "ordinary",
      ownership: "self",
      surfaceAuthority: "ordinary",
    },
  };
}

async function prepareLocalReview(root: string): Promise<LocalReviewPayload> {
  let preparation = await invokeReview(root, ["review", "local", "prepare", "-"], localPrepareRequest());
  if (preparation.state === "coverage-required") {
    const action = preparation.payload.coverageSelectionAction as {
      choices: readonly { requestedCoverage: "incremental" | "complete" }[];
    };
    const complete = action.choices.find(({ requestedCoverage }) => requestedCoverage === "complete");
    if (complete === undefined) throw new Error("local coverage recovery offered no complete choice");
    preparation = await invokeReview(root, ["review", "local", "prepare", "-"], {
      ...localPrepareRequest(),
      coverageAdmission: complete,
    });
  }
  expect(preparation).toMatchObject({ state: "ready", nextAction: "launch-review" });
  return preparation.payload as unknown as LocalReviewPayload;
}

async function completeLocalReview(
  root: string,
  result: "clean" | "findings",
  reviewRunId: string,
): Promise<ReviewEnvelope> {
  const prepared = await prepareLocalReview(root);
  await invokeReview(root, ["review", "local", "attest", "-"], {
    schemaVersion: 1,
    operationId: prepared.operationId,
    result: {
      status: "complete",
      result,
      targetId: prepared.target.targetId,
      headSha: prepared.target.headSha,
      headTree: prepared.target.headTree,
      rubricVersion: prepared.reviewerPayload.guidance.rubricVersion,
      rubricDigest: prepared.reviewerPayload.guidance.rubricDigest,
      sourceDigest: prepared.reviewerPayload.sourceDigest,
      guidanceDigest: prepared.reviewerPayload.guidanceDigest,
      evaluatorIdentity: prepared.request.evaluatorIdentity,
      reviewRunId,
      applicabilityId: null,
      findings: result === "findings"
        ? [{
            findingId: "finding-1",
            severity: "major",
            locus: "src/example.ts:1",
            evidenceUrlOrId: "review:finding-1",
          }]
        : [],
    },
  });
  return invokeReview(root, ["review", "reduce", "-"], {
    schemaVersion: 1,
    operationId: prepared.operationId,
  });
}

async function approveFix(
  root: string,
  source: FindingsReductionPayload["responseSource"],
) {
  const proposed = await invokeReview(root, ["review", "respond", "-"], {
    schemaVersion: 1,
    source,
    proposal: {
      proposedVerification: "focused",
      severityGatingPolicy: { minorGating: "record-only" },
      findings: [{
        findingId: "finding-1",
        sourceVerification: "verified",
        verificationRefs: ["source:src/example.ts:1"],
        verifiedSeverity: "major",
        disposition: "fix",
        title: "Finding title",
        issue: "The reviewer's claim.",
        rationale: "The reviewed source supports applying this fix.",
        recommendation: "Apply the fix.",
        openQuestions: [],
      }],
    },
  });
  expect(proposed).toMatchObject({ state: "awaiting-approval", nextAction: "obtain-approval" });
  const proposal = proposed.payload.proposal as {
    state: "proposed";
    dispositionSet: { targetId: string; dispositionSetId: string };
  };
  return {
    ...proposal,
    state: "approved" as const,
    approval: {
      schemaVersion: 2 as const,
      semanticsVersion: "review-gate/v2" as const,
      targetId: proposal.dispositionSet.targetId,
      dispositionSetId: proposal.dispositionSet.dispositionSetId,
      approvedBy: "test-user",
      approvedAt: "2026-09-10T12:00:00Z",
    },
  };
}

async function reviewAccounting(root: string): Promise<{
  completedPasses: number;
  evaluatorInvocations: number;
}> {
  const store = new LocalReviewOperationStateStore(
    new RepositoryGitCommonStatePublisher(gitExec, root),
  );
  const snapshot = await store.readOperationSnapshot();
  expect(snapshot.status).toBe("complete");
  if (snapshot.status !== "complete") throw new Error("review operation snapshot unavailable");
  const standardProgress = snapshot.records.filter(({ state }) => (
    state.kind === "lane-progress" && state.lane === "standard"
  ));
  return {
    completedPasses: standardProgress.reduce((total, { state }) => (
      state.kind === "lane-progress" ? total + state.completedPasses : total
    ), 0),
    evaluatorInvocations: snapshot.records.filter(({ state }) => state.kind === "local-review").length,
  };
}

async function writeNonDefaultPrePublicationJudgments(root: string): Promise<{
  changeSetPath: string;
  lanesPath: string;
}> {
  const changeSetPath = join(root, ".git", "prepublication-change-set.json");
  const lanesPath = join(root, ".git", "prepublication-lanes.json");
  await writeFile(changeSetPath, JSON.stringify({
    changeSetState: "known",
    contentKind: "code-bearing",
    reviewRisk: "routine",
    changeDeterminacy: "ordinary",
    ownership: "self",
    surfaceAuthority: "ordinary",
  }));
  await writeFile(lanesPath, JSON.stringify({
    frontline: { scopeMode: "whole-target", invocation: { mode: "skip" } },
    standard: { scopeMode: "whole-target" },
  }));
  return { changeSetPath, lanesPath };
}

async function reachAtCapConvergence(root: string): Promise<{
  candidateId: string;
  candidateSubjectDigest: string;
  reviewedHead: string;
  continuationCommand: string;
}> {
  const proposed = await runArc(["attest", "example", "--json"], root);
  expect(proposed.exitCode, JSON.stringify(proposed)).toBe(0);
  await git(root, ["commit", "-m", "verification"]);

  const findings = await completeLocalReview(root, "findings", "run-material-pass-1");
  expect(findings).toMatchObject({ state: "findings", nextAction: "respond" });
  const source = (findings.payload as unknown as FindingsReductionPayload).responseSource;
  const dispositions = await approveFix(root, source);
  const policyRequest = await responsePolicyRequest(root, source);
  await expect(invokeReview(root, ["review", "respond", "-"], {
    schemaVersion: 1,
    source,
    policyRequest,
    dispositions,
  })).resolves.toMatchObject({ state: "ready-to-fix", nextAction: "apply-fix" });

  await writeFile(join(root, "src", "example.ts"), "export const example = 'fixed';\n");
  await git(root, ["add", "src/example.ts"]);
  await git(root, ["commit", "-m", "apply approved fix"]);
  await expect(invokeReview(root, ["review", "respond", "-"], {
    schemaVersion: 1,
    source,
    policyRequest,
    dispositions,
    verifiedFix: {
      applicability: "focused",
      verificationEvidenceRefs: ["verification://focused-fix"],
    },
  })).resolves.toMatchObject({ state: "candidate-advanced", nextAction: "continue-review" });
  await git(root, ["commit", "-m", "record verified response"]);

  const clean = await completeLocalReview(root, "clean", "run-clean-pass-2");
  expect(clean).toMatchObject({ state: "advisory-complete", nextAction: "none" });
  await git(root, ["remote", "add", "origin", OFFLINE_ORIGIN]);
  const judgments = await writeNonDefaultPrePublicationJudgments(root);
  const reviewed = await runArc([
    "review", "pre-publication", "example",
    "--self-review", "settled",
    "--change-set", judgments.changeSetPath,
    "--lanes", judgments.lanesPath,
  ], root, { env: OFFLINE_ENV });
  expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
  const envelope = JSON.parse(reviewed.stdout) as {
    candidateId: string;
    candidateSubjectDigest: string;
    locus: string;
    nextAction: {
      kind: string;
      postAttestContinuation: {
        reviewedHead: string;
        nextAction: { command: string };
        projectionDisposition: string;
      };
    };
  };
  expect(envelope).toMatchObject({
    locus: "candidate-convergence-verification-pending",
    nextAction: {
      kind: "run-convergence-verification",
      postAttestContinuation: {
        projectionDisposition: "keep-staged-until-publication",
        nextAction: {
          command: expect.stringMatching(
            /^arc review pre-publication example --resume [A-Za-z0-9_-]+$/u,
          ),
        },
      },
    },
  });
  const continuationArgv = envelope.nextAction.postAttestContinuation.nextAction.command.split(" ");
  expect(JSON.parse(Buffer.from(continuationArgv[5] ?? "", "base64url").toString("utf8"))).toEqual({
    candidateId: envelope.candidateId,
    candidateSubjectDigest: envelope.candidateSubjectDigest,
    selfReview: "settled",
    changeSet: {
      changeSetState: "known",
      contentKind: "code-bearing",
      reviewRisk: "routine",
      changeDeterminacy: "ordinary",
      ownership: "self",
      surfaceAuthority: "ordinary",
    },
    lanes: {
      frontline: { scopeMode: "whole-target", invocation: { mode: "skip" } },
      standard: { scopeMode: "whole-target" },
    },
  });
  return {
    candidateId: envelope.candidateId,
    candidateSubjectDigest: envelope.candidateSubjectDigest,
    reviewedHead: envelope.nextAction.postAttestContinuation.reviewedHead,
    continuationCommand: envelope.nextAction.postAttestContinuation.nextAction.command,
  };
}

async function runReturnedCommand(
  root: string,
  command: string,
): Promise<Awaited<ReturnType<typeof runArc>>> {
  const argv = command.split(" ");
  expect(argv.shift()).toBe("arc");
  return runArc(argv, root, { env: OFFLINE_ENV });
}

/**
 * Give one fixture copy a base it can actually move, without touching the coordinate its cases depend on.
 *
 * The rewrite maps the unreachable origin URL onto a local bare repository, so `origin` still reports the name
 * the change-request resolver parses while Git reaches a real target. It is installed per probe rather than in
 * the builder: every case above is written against an origin that resolves to no host, and a rewrite there would
 * change that state for all of them.
 */
async function attachLiveBase(repository: string): Promise<string> {
  const remote = join(repository, ".arc-fixture", "origin.git");
  await mkdir(join(repository, ".arc-fixture"), { recursive: true });
  await writeFile(join(repository, ".git", "info", "exclude"), ".arc-fixture/\n", { flag: "a" });
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await git(repository, ["config", `url.${remote}.insteadOf`, OFFLINE_ORIGIN]);
  await git(repository, ["push", "origin", "main"]);
  return remote;
}

/** Settle the Candidate at its pre-publication boundary, the point the submit window opens from. */
async function settleForPublication(repository: string): Promise<string> {
  expect((await runArc(["attest", "example", "--json"], repository)).exitCode).toBe(0);
  const reviewed = await runArc(
    ["review", "pre-publication", "example", "--self-review", "settled"],
    repository,
    { env: OFFLINE_ENV },
  );
  expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
  const envelope = JSON.parse(reviewed.stdout) as { locus: string; candidateId: string };
  expect(envelope.locus).toBe("candidate-publish-ready");
  return envelope.candidateId;
}

function submit(repository: string) {
  return runArc(
    ["publish", "example", "--last-completed", "verification", "--action", "push and open the PR", "--json"],
    repository,
    { env: OFFLINE_ENV },
  );
}

describe("the settle-to-submit window over a live base", () => {
  let repository: string | null = null;

  afterEach(async () => {
    if (repository !== null) await cleanupTempDir(repository);
    repository = null;
  });

  it("submits the same settled Candidate after an advance sharing none of its paths", async () => {
    repository = await createAttestableRepo();
    await attachLiveBase(repository);
    const candidateId = await settleForPublication(repository);
    await advanceBase({ cwd: repository, paths: movementPaths("disjoint", "example").base });

    const submitted = await submit(repository);

    expect(submitted.exitCode, JSON.stringify(submitted)).toBe(0);
    expect(JSON.parse(submitted.stdout)).toMatchObject({
      status: "published",
      boundary: { locus: "publication-pending", candidateId },
    });
  });
});

describe("attest → pre-publication → publish", () => {
  let repository: string | null = null;

  afterEach(async () => {
    if (repository !== null) await cleanupTempDir(repository);
  });

  it.each([
    ["without origin", false],
    ["with origin and no PR", true],
  ])("offers a private Candidate correction review %s", async (_label, originLinked) => {
    repository = await createAtCapPublicationRepo();
    expect((await runArc(["attest", "example", "--json"], repository)).exitCode).toBe(0);
    await git(repository, ["commit", "-m", "verification"]);
    const firstHead = await git(repository, ["rev-parse", "HEAD"]);
    const firstPrepared = await prepareLocalReview(repository);
    await invokeReview(repository, ["review", "local", "attest", "-"], {
      schemaVersion: 1,
      operationId: firstPrepared.operationId,
      result: {
        status: "complete",
        result: "findings",
        targetId: firstPrepared.target.targetId,
        headSha: firstPrepared.target.headSha,
        headTree: firstPrepared.target.headTree,
        rubricVersion: firstPrepared.reviewerPayload.guidance.rubricVersion,
        rubricDigest: firstPrepared.reviewerPayload.guidance.rubricDigest,
        sourceDigest: firstPrepared.reviewerPayload.sourceDigest,
        guidanceDigest: firstPrepared.reviewerPayload.guidanceDigest,
        evaluatorIdentity: firstPrepared.request.evaluatorIdentity,
        reviewRunId: "run-private-candidate-first",
        applicabilityId: null,
        findings: [{
          findingId: "finding-1",
          severity: "major",
          locus: "src/example.ts:1",
          evidenceUrlOrId: "review:finding-1",
        }],
      },
    });
    const findings = await invokeReview(repository, ["review", "reduce", "-"], {
      schemaVersion: 1,
      operationId: firstPrepared.operationId,
    });
    expect(findings).toMatchObject({ state: "findings", nextAction: "respond" });
    const source = (findings.payload as unknown as FindingsReductionPayload).responseSource;
    const dispositions = await approveFix(repository, source);
    const policyRequest = await responsePolicyRequest(repository, source);
    await expect(invokeReview(repository, ["review", "respond", "-"], {
      schemaVersion: 1, source, policyRequest, dispositions,
    })).resolves.toMatchObject({ state: "ready-to-fix", nextAction: "apply-fix" });
    await writeFile(join(repository, "src", "example.ts"), "export const example = 'fixed';\n");
    await git(repository, ["add", "src/example.ts"]);
    await git(repository, ["commit", "-m", "apply approved fix"]);
    await expect(invokeReview(repository, ["review", "respond", "-"], {
      schemaVersion: 1,
      source,
      policyRequest,
      dispositions,
      verifiedFix: {
        applicability: "focused",
        verificationEvidenceRefs: ["verification://focused-fix"],
      },
    })).resolves.toMatchObject({ state: "candidate-advanced", nextAction: "continue-review" });
    await git(repository, ["commit", "-m", "record verified response"]);
    const projectedHead = await git(repository, ["rev-parse", "HEAD"]);
    const reviewEnv = originLinked ? await attachOriginWithoutPr(repository) : undefined;
    if (reviewEnv !== undefined) {
      const noPr = await runArc([
        "review", "change-request", "resolve", "--head-ref", "feat/example",
        "--head-sha", projectedHead,
      ], repository, { env: reviewEnv });
      expect(noPr.exitCode, JSON.stringify(noPr)).toBe(0);
      expect(JSON.parse(noPr.stdout)).toMatchObject({
        state: "none", targetRef: { repository: "arc-framework/example" },
      });
    }

    const offered = await invokeReview(repository, ["review", "local", "prepare", "-"],
      localPrepareRequest(), reviewEnv);
    expect(offered).toMatchObject({ state: "coverage-required", nextAction: "select-coverage" });
    const selection = offered.payload.coverageSelectionAction as {
      choices: readonly {
        requestedCoverage: "incremental" | "complete";
        correctionScope?: LocalReviewPayload["reviewerPayload"]["correctionScope"];
      }[];
    };
    expect(selection.choices.map(({ requestedCoverage }) => requestedCoverage))
      .toEqual(["incremental", "complete"]);
    const incremental = selection.choices[0];
    if (incremental?.correctionScope === undefined) {
      throw new Error("private Candidate correction offered no exact incremental scope");
    }
    expect(incremental.correctionScope).toMatchObject({
      predecessorProducerId: firstPrepared.operationId,
      predecessorHeadSha: firstHead,
      basisHeadSha: firstHead,
      headSha: projectedHead,
      requiredFindings: [{
        producerId: firstPrepared.operationId,
        findingId: "finding-1",
        locus: "src/example.ts:1",
      }],
    });
    const prepared = await invokeReview(repository, ["review", "local", "prepare", "-"], {
      ...localPrepareRequest(), coverageAdmission: incremental,
    }, reviewEnv);
    expect(prepared).toMatchObject({ state: "ready", nextAction: "launch-review" });
    const payload = prepared.payload as unknown as LocalReviewPayload;
    expect(payload.reviewerPayload.correctionScope).toMatchObject(incremental.correctionScope);
    expect(payload.reviewerPayload.reviewerInstructions).toContain(`${firstHead}..${projectedHead}`);
    expect(payload.reviewerPayload.reviewerInstructions).toContain("finding-1");
    await expect(invokeReview(repository, ["review", "local", "attest", "-"], {
      schemaVersion: 1,
      operationId: payload.operationId,
      result: {
        status: "complete", result: "clean", targetId: payload.target.targetId,
        headSha: payload.target.headSha, headTree: payload.target.headTree,
        rubricVersion: payload.reviewerPayload.guidance.rubricVersion,
        rubricDigest: payload.reviewerPayload.guidance.rubricDigest,
        sourceDigest: payload.reviewerPayload.sourceDigest,
        guidanceDigest: payload.reviewerPayload.guidanceDigest,
        evaluatorIdentity: payload.request.evaluatorIdentity,
        reviewRunId: "run-private-candidate-correction",
        applicabilityId: null,
        findings: [],
      },
    })).resolves.toMatchObject({ state: "attested-current", nextAction: "reduce" });
    await expect(invokeReview(repository, ["review", "reduce", "-"], {
      schemaVersion: 1, operationId: payload.operationId,
    })).resolves.toMatchObject({ state: "advisory-complete", nextAction: "none" });
    if (!originLinked) await git(repository, ["remote", "add", "origin", OFFLINE_ORIGIN]);
    const judgments = await writeNonDefaultPrePublicationJudgments(repository);
    const converged = await runArc([
      "review", "pre-publication", "example",
      "--self-review", "settled",
      "--change-set", judgments.changeSetPath,
      "--lanes", judgments.lanesPath,
    ], repository, { env: { ...OFFLINE_ENV, ...reviewEnv } });
    expect(converged.exitCode, JSON.stringify(converged)).toBe(0);
    expect(JSON.parse(converged.stdout)).toMatchObject({
      locus: "candidate-convergence-verification-pending",
      nextAction: { kind: "run-convergence-verification" },
    });
  }, 120_000);

  it.each(["defer", "reject"] as const)(
    "continues a settled material %s at the unchanged head to the next pass", async (disposition) => {
      repository = await createAtCapPublicationRepo();
      expect((await runArc(["attest", "example", "--json"], repository)).exitCode).toBe(0);
      await git(repository, ["commit", "-m", "verification"]);
      const findings = await completeLocalReview(repository, "findings", "run-material-defer-pass-1");
      expect(findings).toMatchObject({ state: "findings", nextAction: "respond" });
      const source = (findings.payload as unknown as FindingsReductionPayload).responseSource;
      const proposed = await invokeReview(repository, ["review", "respond", "-"], {
        schemaVersion: 1, source,
        proposal: {
          proposedVerification: "focused",
          severityGatingPolicy: { minorGating: "record-only" },
          findings: [{
            findingId: "finding-1",
            sourceVerification: "verified",
            verificationRefs: ["source:src/example.ts:1"],
            verifiedSeverity: "major",
            disposition,
            title: "Finding title",
            issue: "The reviewer's claim.",
            rationale: disposition === "defer"
              ? "The material finding is valid but has an approved destination."
              : "The material finding is outside the current change responsibility.",
            recommendation: disposition === "defer"
              ? "Defer to the recorded destination and continue review."
              : "Record the approved rejection and continue review.",
            openQuestions: [],
          }],
        },
      });
      expect(proposed).toMatchObject({ state: "awaiting-approval", nextAction: "obtain-approval" });
      await git(repository, ["remote", "add", "origin", OFFLINE_ORIGIN]);
      const judgments = await writeNonDefaultPrePublicationJudgments(repository);
      const prePublicationArgv = [
        "review", "pre-publication", "example",
        "--self-review", "settled",
        "--change-set", judgments.changeSetPath,
        "--lanes", judgments.lanesPath,
      ];
      const pending = await runArc(prePublicationArgv, repository, { env: OFFLINE_ENV });
      expect(pending.exitCode, JSON.stringify(pending)).toBe(0);
      expect(JSON.parse(pending.stdout)).toMatchObject({
        locus: "candidate-fix-pending",
        nextAction: { command: "arc review respond -" },
      });
      const proposal = proposed.payload.proposal as {
        state: "proposed";
        dispositionSet: { targetId: string; dispositionSetId: string };
      };
      const dispositions = {
        ...proposal,
        state: "approved" as const,
        approval: {
          schemaVersion: 2 as const,
          semanticsVersion: "review-gate/v2" as const,
          targetId: proposal.dispositionSet.targetId,
          dispositionSetId: proposal.dispositionSet.dispositionSetId,
          approvedBy: "test-user",
          approvedAt: "2026-09-10T12:00:00Z",
        },
      };
      const policyRequest = await responsePolicyRequest(repository, source);
      await expect(invokeReview(repository, ["review", "respond", "-"], {
        schemaVersion: 1, source, policyRequest, dispositions,
      })).resolves.toMatchObject({ state: "settled", nextAction: "reduce" });

      const continued = await runArc(prePublicationArgv, repository, { env: OFFLINE_ENV });
      expect(continued.exitCode, JSON.stringify(continued)).toBe(0);
      expect(JSON.parse(continued.stdout)).toMatchObject({
        locus: "candidate-review-pending",
        policy: { state: "ready", nextAction: "local-prepare", payload: { pass: 2 } },
      });
      const replay = await runArc(prePublicationArgv, repository, { env: OFFLINE_ENV });
      expect(replay.exitCode, JSON.stringify(replay)).toBe(0);
      expect(JSON.parse(replay.stdout)).toMatchObject({
        locus: "candidate-review-pending",
        policy: { state: "ready", nextAction: "local-prepare", payload: { pass: 2 } },
      });
      expect((await reviewAccounting(repository)).completedPasses).toBe(1);
  }, 120_000);

  it("offers the findings response before approval and after the approved fix commit", async () => {
    repository = await createAtCapPublicationRepo();
    expect((await runArc(["attest", "example", "--json"], repository)).exitCode).toBe(0);
    await git(repository, ["commit", "-m", "verification"]);
    const findings = await completeLocalReview(repository, "findings", "run-prepublication-findings");
    expect(findings).toMatchObject({ state: "findings", nextAction: "respond" });
    const source = (findings.payload as unknown as FindingsReductionPayload).responseSource;
    await git(repository, ["remote", "add", "origin", OFFLINE_ORIGIN]);
    const judgments = await writeNonDefaultPrePublicationJudgments(repository);
    const argv = [
      "review", "pre-publication", "example",
      "--self-review", "settled",
      "--change-set", judgments.changeSetPath,
      "--lanes", judgments.lanesPath,
    ];
    const fresh = await runArc(argv, repository, { env: OFFLINE_ENV });
    expect(fresh.exitCode, JSON.stringify(fresh)).toBe(0);
    expect(JSON.parse(fresh.stdout)).toMatchObject({
      locus: "candidate-fix-pending",
      nextAction: { command: "arc review respond -", responseSource: source },
    });

    const dispositions = await approveFix(repository, source);
    const policyRequest = await responsePolicyRequest(repository, source);
    await expect(invokeReview(repository, ["review", "respond", "-"], {
      schemaVersion: 1, source, policyRequest, dispositions,
    })).resolves.toMatchObject({ state: "ready-to-fix", nextAction: "apply-fix" });
    await writeFile(join(repository, "src", "example.ts"), "export const example = 'fixed';\n");
    await git(repository, ["add", "src/example.ts"]);
    await git(repository, ["commit", "-m", "apply approved fix"]);

    const committed = await runArc(argv, repository, { env: OFFLINE_ENV });
    expect(committed.exitCode, JSON.stringify(committed)).toBe(0);
    expect(JSON.parse(committed.stdout)).toMatchObject({
      locus: "candidate-fix-pending",
      nextAction: { command: "arc review respond -", responseSource: source },
    });
  }, 120_000);

  it("settles the boundary at pre-publication and submits on the first call", async () => {
    repository = await createAttestableRepo();

    const proposed = await runArc(["attest", "example", "--json"], repository);
    expect(proposed.exitCode, JSON.stringify(proposed)).toBe(0);
    expect(JSON.parse(proposed.stdout)).toMatchObject({
      status: "attested",
      locus: {
        locus: "candidate-review-pending",
        nextAction: { command: "arc review pre-publication example" },
      },
    });

    const status = await runArc(["status", "example", "--json"], repository);
    expect(status.exitCode, JSON.stringify(status)).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({
      slug: "example",
      state: "active",
      integrationBoundary: {
        candidateId: JSON.parse(proposed.stdout).locus.candidateId,
        locus: "candidate-review-pending",
        nextAction: { command: "arc review pre-publication example" },
      },
    });

    const reviewed = await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled"],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
    const envelope = JSON.parse(reviewed.stdout) as Record<string, unknown>;
    expect(envelope).toMatchObject({
      mode: "pre-publication-review",
      workUnit: "example",
      locus: "candidate-publish-ready",
      nextAction: { kind: "publish-candidate", command: "arc publish example --json" },
    });

    const boundaryPath = join(
      ".arc", "system", ".internal", "candidates", "example.boundary.json",
    );
    const boundary = JSON.parse(await readFile(join(repository, boundaryPath), "utf8")) as {
      locus: string;
      candidateId: string;
    };
    expect(boundary.locus).toBe("candidate-publish-ready");
    expect(boundary.candidateId).toBe(envelope.candidateId);
    expect((await git(repository, ["diff", "--cached", "--name-only"])).split("\n"))
      .toContain(boundaryPath.split("\\").join("/"));

    const submitted = await runArc(
      [
        "publish", "example",
        "--last-completed", "verification",
        "--action", "push and open the PR",
        "--json",
      ],
      repository,
      { env: OFFLINE_ENV },
    );

    expect(submitted.exitCode, JSON.stringify(submitted)).toBe(0);
    expect(JSON.parse(submitted.stdout)).toMatchObject({
      status: "published",
      boundary: { locus: "publication-pending", candidateId: envelope.candidateId },
    });
    const publishedMeta = await readFile(join(repository, ".arc", "active", "meta-example.md"), "utf8");
    expect(publishedMeta).toContain("| `Integrating` | `test-user`");
    expect(publishedMeta).toContain("- **Current Workflow:** `integrate-work-unit`");

    // Submission advanced the boundary past its settle point; repeating reports the resume point
    // rather than re-firing the transition.
    const repeated = await runArc(
      [
        "publish", "example",
        "--last-completed", "verification",
        "--action", "push and open the PR",
        "--json",
      ],
      repository,
      { env: OFFLINE_ENV },
    );

    expect(repeated.exitCode, JSON.stringify(repeated)).toBe(0);
    expect(JSON.parse(repeated.stdout)).toMatchObject({
      status: "unchanged",
      boundary: { locus: "publication-pending" },
    });
  });

  it("publishes a clean result at the pass cap with one projection commit and no new review", async () => {
    repository = await createAtCapPublicationRepo();
    const pending = await reachAtCapConvergence(repository);
    const accountingAtCap = await reviewAccounting(repository);
    expect(accountingAtCap).toEqual({ completedPasses: 2, evaluatorInvocations: 2 });

    const attested = await runArc([
      "attest", "example", "--scope", "focused",
      "--verification-evidence-ref", "verification://focused-pre-publication-convergence", "--json",
    ], repository);
    expect(attested.exitCode, JSON.stringify(attested)).toBe(0);
    const attestedResult = JSON.parse(attested.stdout) as {
      locus: { nextAction: { command: string } };
    };
    expect(attestedResult).toMatchObject({
      status: "attested",
      operation: "convergence",
      locus: {
        locus: "candidate-review-pending",
        candidateId: pending.candidateId,
        candidateSubjectDigest: pending.candidateSubjectDigest,
        postAttestContinuation: {
          reviewedHead: pending.reviewedHead,
          projectionDisposition: "keep-staged-until-publication",
        },
        nextAction: { command: pending.continuationCommand },
      },
    });

    // A plain same-head re-entry reads the saved nondefault self-review, routing, lane, and
    // ceiling judgments from the durable continuation; it has no caller-supplied resume token.
    const ready = await runArc(["review", "pre-publication", "example"], repository, {
      env: OFFLINE_ENV,
    });
    expect(ready.exitCode, JSON.stringify(ready)).toBe(0);
    expect(JSON.parse(ready.stdout)).toMatchObject({
      locus: "candidate-publish-ready",
      candidateId: pending.candidateId,
      candidateSubjectDigest: pending.candidateSubjectDigest,
      nextAction: { kind: "publish-candidate", command: "arc publish example --json" },
    });
    expect(await reviewAccounting(repository)).toEqual(accountingAtCap);

    const readyReplay = await runReturnedCommand(repository, pending.continuationCommand);
    expect(readyReplay.exitCode, JSON.stringify(readyReplay)).toBe(0);
    expect(JSON.parse(readyReplay.stdout)).toMatchObject({ locus: "candidate-publish-ready" });
    const savedToken = pending.continuationCommand.split(" ")[5] ?? "";
    const staleInput = JSON.parse(Buffer.from(savedToken, "base64url").toString("utf8"));
    const staleToken = Buffer.from(JSON.stringify({
      ...staleInput,
      candidateSubjectDigest: `sha256:${"f".repeat(64)}`,
    }), "utf8").toString("base64url");
    const staleReplay = await runArc(
      ["review", "pre-publication", "example", "--resume", staleToken],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(staleReplay.exitCode).toBe(1);
    expect(JSON.parse(staleReplay.stdout)).toMatchObject({
      error: { code: "invalid-input" },
      remedy: { argv: ["arc", "review", "pre-publication", "example"] },
    });
    const readyBoundaryPath = join(
      repository,
      ".arc", "system", ".internal", "candidates", "example.boundary.json",
    );
    expect(JSON.parse(await readFile(readyBoundaryPath, "utf8"))).toMatchObject({
      locus: "candidate-publish-ready",
      candidateId: pending.candidateId,
    });
    expect(JSON.parse(await readFile(readyBoundaryPath, "utf8"))).not.toHaveProperty(
      "postAttestContinuation",
    );

    const beforeProjectionCommit = await git(repository, ["rev-parse", "HEAD"]);
    const published = await runArc([
      "publish", "example",
      "--last-completed", "verification",
      "--action", "push and open the PR",
      "--json",
    ], repository, { env: OFFLINE_ENV });
    expect(published.exitCode, JSON.stringify(published)).toBe(0);
    expect(JSON.parse(published.stdout)).toMatchObject({
      status: "published",
      boundary: { locus: "publication-pending", candidateId: pending.candidateId },
    });
    const publicationReplay = await runReturnedCommand(repository, pending.continuationCommand);
    expect(publicationReplay.exitCode, JSON.stringify(publicationReplay)).toBe(0);
    expect(JSON.parse(publicationReplay.stdout)).toMatchObject({
      locus: "publication-pending",
      candidateId: pending.candidateId,
      nextAction: { kind: "continue-publication" },
    });
    const publicationPlainRetry = await runArc(["review", "pre-publication", "example"], repository, {
      env: OFFLINE_ENV,
    });
    expect(publicationPlainRetry.exitCode, JSON.stringify(publicationPlainRetry)).toBe(0);
    expect(JSON.parse(publicationPlainRetry.stdout)).toMatchObject({ locus: "publication-pending" });
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "-m", "chore(arc): project publication readiness"]);
    expect(await git(repository, ["rev-list", "--count", `${beforeProjectionCommit}..HEAD`])).toBe("1");
    expect(await git(repository, ["status", "--porcelain"])).toBe("");
    const committedReplay = await runReturnedCommand(repository, pending.continuationCommand);
    expect(committedReplay.exitCode, JSON.stringify(committedReplay)).toBe(0);
    expect(JSON.parse(committedReplay.stdout)).toMatchObject({ locus: "publication-pending" });
    expect(await reviewAccounting(repository)).toEqual(accountingAtCap);
  }, 120_000);

  it("refuses a premature projection commit and admits only exact version-bound recovery", async () => {
    repository = await createAtCapPublicationRepo();
    const pending = await reachAtCapConvergence(repository);
    const accountingAtCap = await reviewAccounting(repository);
    const attested = await runArc([
      "attest", "example", "--scope", "focused",
      "--verification-evidence-ref", "verification://focused-pre-publication-convergence", "--json",
    ], repository);
    expect(attested.exitCode, JSON.stringify(attested)).toBe(0);
    const continuation = (JSON.parse(attested.stdout) as {
      locus: { nextAction: { command: string } };
    }).locus.nextAction.command;

    await git(repository, ["commit", "-m", "premature lifecycle projection"]);
    const conflict = await runReturnedCommand(repository, continuation);
    expect(conflict.exitCode).toBe(1);
    const refusal = JSON.parse(conflict.stdout) as {
      error: { code: string };
      remedy: { argv: string[] };
    };
    expect(refusal).toMatchObject({
      error: { code: "attestation-ordering-conflict" },
      remedy: {
        argv: ["arc", "review", "pre-publication", "example", "--resume", expect.any(String)],
      },
    });
    expect(refusal.remedy.argv.join(" ")).not.toBe(continuation);

    const repeated = await runReturnedCommand(repository, continuation);
    expect(repeated.exitCode).toBe(1);
    expect(JSON.parse(repeated.stdout)).toMatchObject({
      error: { code: "attestation-ordering-conflict" },
      remedy: { argv: refusal.remedy.argv },
    });
    expect(await reviewAccounting(repository)).toEqual(accountingAtCap);

    const recovered = await runArc(refusal.remedy.argv.slice(1), repository, { env: OFFLINE_ENV });
    expect(recovered.exitCode, JSON.stringify(recovered)).toBe(0);
    expect(JSON.parse(recovered.stdout)).toMatchObject({
      locus: "candidate-publish-ready",
      nextAction: { kind: "publish-candidate" },
      candidateId: pending.candidateId,
      candidateSubjectDigest: pending.candidateSubjectDigest,
    });
    // The extra commit changed only the operational projection. The clean second pass remains
    // applicable after the explicit ordering recovery, so no third pass or override is due.
    expect(await reviewAccounting(repository)).toEqual(accountingAtCap);

    const boundaryPath = join(
      repository,
      ".arc", "system", ".internal", "candidates", "example.boundary.json",
    );
    const recoveredBoundary = await readFile(boundaryPath, "utf8");
    expect(JSON.parse(recoveredBoundary)).not.toHaveProperty("postAttestContinuation");

    const staleRecovery = await runArc(refusal.remedy.argv.slice(1), repository, { env: OFFLINE_ENV });
    expect(staleRecovery.exitCode).toBe(1);
    expect(JSON.parse(staleRecovery.stdout)).toMatchObject({
      error: { code: "attestation-ordering-conflict" },
    });
    expect(await readFile(boundaryPath, "utf8")).toBe(recoveredBoundary);

    const oldTokenReplay = await runReturnedCommand(repository, continuation);
    expect(oldTokenReplay.exitCode, JSON.stringify(oldTokenReplay)).toBe(0);
    expect(JSON.parse(oldTokenReplay.stdout)).toMatchObject({
      locus: "candidate-publish-ready",
      nextAction: { kind: "publish-candidate" },
    });
    expect(JSON.parse(await readFile(boundaryPath, "utf8"))).not.toHaveProperty(
      "postAttestContinuation",
    );
    expect(await reviewAccounting(repository)).toEqual(accountingAtCap);
  }, 120_000);

  it("reroutes changed reviewable content before spending another capped review", async () => {
    repository = await createAtCapPublicationRepo();
    const pending = await reachAtCapConvergence(repository);
    const accountingAtCap = await reviewAccounting(repository);
    const attested = await runArc([
      "attest", "example", "--scope", "focused",
      "--verification-evidence-ref", "verification://focused-pre-publication-convergence", "--json",
    ], repository);
    expect(attested.exitCode, JSON.stringify(attested)).toBe(0);
    const continuation = (JSON.parse(attested.stdout) as {
      locus: { nextAction: { command: string } };
    }).locus.nextAction.command;

    await writeFile(join(repository, "src", "example.ts"), "export const example = 'changed again';\n");
    await git(repository, ["add", "src/example.ts"]);
    await git(repository, ["commit", "-m", "change reviewed content after attestation"]);

    const rerouted = await runReturnedCommand(repository, continuation);
    expect(rerouted.exitCode).toBe(1);
    expect(JSON.parse(rerouted.stdout)).toMatchObject({
      error: { code: "candidate-unexplained-delta" },
      remedy: { argv: ["arc", "attest", "example", "--new-root"] },
    });
    expect(await reviewAccounting(repository)).toEqual(accountingAtCap);

    const boundaryPath = join(
      repository,
      ".arc", "system", ".internal", "candidates", "example.boundary.json",
    );
    expect(JSON.parse(await readFile(boundaryPath, "utf8"))).toMatchObject({
      locus: "candidate-review-pending",
      candidateId: pending.candidateId,
      postAttestContinuation: { reviewedHead: pending.reviewedHead },
    });
  }, 120_000);

  it("submits over a boundary an operational-only commit advanced the head past", async () => {
    repository = await createAttestableRepo();
    expect((await runArc(["attest", "example", "--json"], repository)).exitCode).toBe(0);
    await git(repository, ["commit", "-m", "verification"]);

    const reviewed = await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled"],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
    expect(JSON.parse(reviewed.stdout)).toMatchObject({ locus: "candidate-publish-ready" });

    // Committing the staged boundary is the ordinary next keystroke, and it moves the head without
    // touching a reviewable byte. Submission authorizes on the reviewable subject, so the settled
    // review evidence still covers this change set and the operator is not sent back through review.
    const reviewedHead = await git(repository, ["rev-parse", "HEAD"]);
    await git(repository, ["commit", "-m", "chore(arc): settle the pre-publication boundary"]);
    expect(await git(repository, ["rev-parse", "HEAD"])).not.toBe(reviewedHead);

    const submitted = await runArc(
      [
        "publish", "example",
        "--last-completed", "verification",
        "--action", "push and open the PR",
        "--json",
      ],
      repository,
      { env: OFFLINE_ENV },
    );

    expect(submitted.exitCode, JSON.stringify(submitted)).toBe(0);
    expect(JSON.parse(submitted.stdout)).toMatchObject({
      status: "published",
      boundary: { locus: "publication-pending" },
    });
  });

  it("preserves advanced review authority when an unchanged Candidate is re-attested", async () => {
    repository = await createAttestableRepo();
    expect((await runArc(["attest", "example", "--json"], repository)).exitCode).toBe(0);
    await git(repository, ["commit", "-m", "verification"]);

    const reviewed = await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled"],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
    const reviewedEnvelope = JSON.parse(reviewed.stdout) as {
      candidateId: string;
      candidateSubjectDigest: string;
      target: { headSha: string };
    };
    const boundaryPath = join(
      repository,
      ".arc", "system", ".internal", "candidates", "example.boundary.json",
    );
    const readyBoundary = JSON.parse(await readFile(boundaryPath, "utf8")) as Record<string, unknown>;
    const reservation = createStandardReviewReservation({
      candidateId: reviewedEnvelope.candidateId,
      sourceId: "coderabbit-pr",
      sources: ["coderabbit-pr", "codex-pr"],
      repository: "arc-framework/example",
      headSha: reviewedEnvelope.target.headSha,
      obligation: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"e".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
    });
    await writeFile(boundaryPath, `${JSON.stringify({ ...readyBoundary, reservation }, null, 2)}\n`);
    await git(repository, ["add", boundaryPath]);

    const readyReplay = await runArc(["attest", "example", "--json"], repository);
    expect(readyReplay.exitCode, JSON.stringify(readyReplay)).toBe(0);
    expect(JSON.parse(readyReplay.stdout)).toMatchObject({
      status: "unchanged",
      locus: { locus: "candidate-publish-ready", reservation },
    });

    const submitted = await runArc(
      [
        "publish", "example",
        "--last-completed", "verification",
        "--action", "push and open the PR",
        "--json",
      ],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(submitted.exitCode, JSON.stringify(submitted)).toBe(0);
    expect(JSON.parse(submitted.stdout)).toMatchObject({
      status: "published",
      boundary: { locus: "publication-pending", reservation },
    });

    const publishedReplay = await runArc(["attest", "example", "--json"], repository);
    expect(publishedReplay.exitCode, JSON.stringify(publishedReplay)).toBe(0);
    expect(JSON.parse(publishedReplay.stdout)).toMatchObject({
      status: "unchanged",
      locus: { locus: "publication-pending", reservation },
    });
    const meta = await readFile(join(repository, ".arc", "active", "meta-example.md"), "utf8");
    expect(meta).toContain("- **Current Workflow:** `integrate-work-unit`");
    expect(meta).toContain("- **Next Action:** push and open the PR");
  });

  it("rebinds a carried reservation after an approved Candidate response advances the subject", async () => {
    repository = await createAttestableRepo();
    expect((await runArc(["attest", "example", "--json"], repository)).exitCode).toBe(0);
    await git(repository, ["commit", "-m", "verification"]);

    const reviewed = await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled"],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
    const reviewedEnvelope = JSON.parse(reviewed.stdout) as {
      candidateId: string;
      candidateSubjectDigest: string;
      target: { headSha: string };
    };
    const candidatePath = join(
      repository,
      ".arc", "system", ".internal", "candidates", "example.json",
    );
    const boundaryPath = join(
      repository,
      ".arc", "system", ".internal", "candidates", "example.boundary.json",
    );
    const priorBoundary = JSON.parse(await readFile(boundaryPath, "utf8")) as Record<string, unknown>;
    const reservation = createStandardReviewReservation({
      candidateId: reviewedEnvelope.candidateId,
      sourceId: "coderabbit-pr",
      sources: ["coderabbit-pr", "codex-pr"],
      repository: "arc-framework/example",
      headSha: reviewedEnvelope.target.headSha,
      obligation: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"e".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
    });
    await writeFile(boundaryPath, `${JSON.stringify({ ...priorBoundary, reservation }, null, 2)}\n`);
    await writeFile(join(repository, "src", "example.ts"), "export const example = 'fixed';\n");
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "-m", "fix review finding"]);

    const record = parseCandidateManagedRecord(await readFile(candidatePath, "utf8"));
    expect(record).not.toBeNull();
    if (record === null) return;
    const current = await collectCandidateSubjectTarget({
      cwd: repository,
      name: "example",
      baseBranch: "main",
      exec: async (cmd, args, options) => {
        const result = await execFileAsync(cmd, args, {
          cwd: options?.cwd ?? repository ?? undefined,
          encoding: "utf8",
        });
        return { stdout: result.stdout, stderr: result.stderr };
      },
    });
    const projection = projectCandidateDeltaVerification({
      record,
      oldTarget: { revision: record.attestation.baseRevision, subject: record.subject },
      current,
    });
    const independentlyProducedResponse = recordCandidateVerifiedResponse({
      projection,
      dispositionId: canonicalDigest({ disposition: "approved" }),
      approvedBy: "test-user",
      appliedBy: "test-agent",
      applicability: "focused",
      verificationEvidenceRefs: ["test://focused"],
    });
    const response = createCandidateReviewResponseEvidence({
      candidateId: independentlyProducedResponse.candidateId,
      oldTarget: independentlyProducedResponse.oldTarget,
      newTarget: independentlyProducedResponse.newTarget,
      dispositionId: independentlyProducedResponse.dispositionId,
      approvedBy: independentlyProducedResponse.approvedBy,
      appliedBy: independentlyProducedResponse.appliedBy,
      applicability: independentlyProducedResponse.applicability,
      approvedVerification: "focused",
      verificationEvidenceRefs: independentlyProducedResponse.verificationEvidenceRefs,
      implementationChanged: independentlyProducedResponse.implementationChanged,
    });
    await writeFile(candidatePath, serializeCandidateManagedRecord(CandidateManagedRecordV1Schema.parse({
      ...record,
      transitions: [...record.transitions, response],
    })));
    await git(repository, ["add", candidatePath]);

    const resumed = await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled"],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(resumed.exitCode, JSON.stringify(resumed)).toBe(0);
    expect(JSON.parse(resumed.stdout)).toMatchObject({
      locus: "candidate-convergence-verification-pending",
      nextAction: {
        kind: "run-convergence-verification",
        requiredScope: "focused",
        verificationKind: "focused",
        verificationEvidenceRefRequired: true,
        attestArgv: [
          "arc", "attest", "example", "--scope", "focused",
          "--verification-evidence-ref", "{verificationEvidenceRef}", "--json",
        ],
      },
    });
    const pendingConvergenceBoundary = JSON.parse(await readFile(boundaryPath, "utf8"));
    expect(pendingConvergenceBoundary).toMatchObject({
      candidateId: reviewedEnvelope.candidateId,
      candidateSubjectDigest: current.subject.subjectDigest,
      locus: "candidate-convergence-verification-pending",
      reservation: { sources: ["coderabbit-pr", "codex-pr"] },
      nextAction: {
        kind: "run-convergence-verification",
        postAttestContinuation: {
          reviewedHead: current.revision,
          projectionDisposition: "keep-staged-until-publication",
          nextAction: {
            kind: "continue-pre-publication-review",
            command: expect.stringMatching(
              /^arc review pre-publication example --resume [A-Za-z0-9_-]+$/u,
            ),
          },
        },
      },
    });
    const postAttestContinuation = pendingConvergenceBoundary.nextAction.postAttestContinuation;

    const converged = await runArc([
      "attest", "example", "--scope", "focused",
      "--verification-evidence-ref", "verification://focused-pre-publication-convergence", "--json",
    ], repository);
    expect(converged.exitCode, JSON.stringify(converged)).toBe(0);
    const convergedResult = JSON.parse(converged.stdout);
    expect(convergedResult).toMatchObject({
      status: "attested",
      operation: "convergence",
      scope: "focused",
      verificationEvidenceRef: "verification://focused-pre-publication-convergence",
      locus: {
        locus: "candidate-review-pending",
        candidateId: reviewedEnvelope.candidateId,
        candidateSubjectDigest: current.subject.subjectDigest,
        reservation: { sources: ["coderabbit-pr", "codex-pr"] },
        nextAction: postAttestContinuation.nextAction,
        postAttestContinuation,
      },
    });

    const convergedBoundary = JSON.parse(await readFile(boundaryPath, "utf8"));
    expect(convergedBoundary).toMatchObject({
      locus: "candidate-review-pending",
      candidateId: reviewedEnvelope.candidateId,
      candidateSubjectDigest: current.subject.subjectDigest,
      reservation: { sources: ["coderabbit-pr", "codex-pr"] },
      nextAction: postAttestContinuation.nextAction,
      postAttestContinuation,
    });

    // Recreate the durable state left when the Candidate write succeeds but the later boundary
    // write is interrupted. A retry must install the already-computed convergence resume rather
    // than preserving this stale next action forever.
    await writeFile(boundaryPath, `${JSON.stringify(pendingConvergenceBoundary, null, 2)}\n`);
    await git(repository, ["add", boundaryPath]);
    const recovered = await runArc(["attest", "example", "--json"], repository);
    expect(recovered.exitCode, JSON.stringify(recovered)).toBe(0);
    const recoveredResult = JSON.parse(recovered.stdout);
    expect(recoveredResult).toMatchObject({
      status: "unchanged",
      locus: {
        locus: "candidate-review-pending",
        candidateId: reviewedEnvelope.candidateId,
        candidateSubjectDigest: current.subject.subjectDigest,
        reservation: { sources: ["coderabbit-pr", "codex-pr"] },
        nextAction: {
          kind: "continue-pre-publication-review",
          command: postAttestContinuation.nextAction.command,
        },
      },
    });

    // Follow the repaired durable continuation exactly, preserving its settled self-review
    // judgment and the carried reservation without a test-only override.
    const continued = await runReturnedCommand(repository, recoveredResult.locus.nextAction.command);
    expect(continued.exitCode, JSON.stringify(continued)).toBe(0);
    expect(JSON.parse(continued.stdout)).toMatchObject({
      locus: "candidate-publish-ready",
      candidateId: reviewedEnvelope.candidateId,
      candidateSubjectDigest: current.subject.subjectDigest,
      reservation: { sources: ["coderabbit-pr", "codex-pr"] },
      nextAction: { kind: "publish-candidate", command: "arc publish example --json" },
    });
  });

  it("routes named status through publication finalization while its recovery marker is present", async () => {
    repository = await createAttestableRepo();
    expect((await runArc(["attest", "example", "--json"], repository)).exitCode).toBe(0);
    await git(repository, ["commit", "-m", "verification"]);
    expect((await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled"],
      repository,
      { env: OFFLINE_ENV },
    )).exitCode).toBe(0);
    expect((await runArc(
      ["publish", "example", "--last-completed", "verification", "--json"],
      repository,
      { env: OFFLINE_ENV },
    )).exitCode).toBe(0);

    const metaPath = join(repository, ".arc", "active", "meta-example.md");
    const publishedMeta = await readFile(metaPath, "utf8");
    await writeFile(metaPath, publishedMeta.replace(
      "- **Current Workflow:** `integrate-work-unit`",
      "- **Current Workflow:** `prepare-work-unit`",
    ));

    const status = await runArc(["status", "example", "--json"], repository);
    expect(status.exitCode, JSON.stringify(status)).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({
      state: "integrating",
      integrationBoundary: {
        locus: "publication-pending",
        nextAction: {
          kind: "continue-publication",
          command: "arc publish example --json",
        },
      },
    });
  });

  it("composes a non-null exact target from a clean committed Candidate", async () => {
    repository = await createAttestableRepo();
    expect((await runArc(["attest", "example", "--json"], repository)).exitCode).toBe(0);
    await git(repository, ["commit", "-m", "verification"]);
    const headSha = await git(repository, ["rev-parse", "HEAD"]);

    const reviewed = await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled"],
      repository,
      { env: OFFLINE_ENV },
    );

    expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
    expect(JSON.parse(reviewed.stdout)).toMatchObject({
      locus: "candidate-publish-ready",
      candidateId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      target: {
        kind: "change-set",
        headSha,
        targetId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      },
    });
  });

  it("executes the advertised self-review resume command through the CLI", async () => {
    repository = await createAttestableRepo();
    expect((await runArc(["attest", "example", "--json"], repository)).exitCode).toBe(0);
    await git(repository, ["commit", "-m", "verification"]);

    const offered = await runArc(["review", "pre-publication", "example"], repository, { env: OFFLINE_ENV });
    expect(offered.exitCode, JSON.stringify(offered)).toBe(0);
    const envelope = JSON.parse(offered.stdout) as {
      locus: string;
      nextAction: { kind: string; command: string };
    };
    expect(envelope).toMatchObject({
      locus: "candidate-review-pending",
      nextAction: {
        kind: "run-self-review",
        command: expect.stringMatching(/^arc review pre-publication example --resume [A-Za-z0-9_-]+$/u),
      },
    });

    const resumed = await runReturnedCommand(repository, envelope.nextAction.command);
    expect(resumed.exitCode, JSON.stringify(resumed)).toBe(0);
    expect(JSON.parse(resumed.stdout)).toMatchObject({ locus: "candidate-publish-ready" });
  });

  it("refuses submission while a pre-publication obligation is still open", async () => {
    repository = await createAttestableRepo();
    expect((await runArc(["attest", "example", "--json"], repository)).exitCode).toBe(0);

    // Self-review is active by package default, so the bare procedure leaves the durable
    // Candidate boundary open rather than authorizing publication.
    const reviewed = await runArc(
      ["review", "pre-publication", "example"],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
    expect(JSON.parse(reviewed.stdout)).toMatchObject({
      locus: "candidate-review-pending",
      nextAction: { kind: "run-self-review" },
    });

    const submitted = await runArc(
      [
        "publish", "example",
        "--last-completed", "verification",
        "--action", "push and open the PR",
      ],
      repository,
      { env: OFFLINE_ENV },
    );

    expect(submitted.exitCode).not.toBe(0);
    expect(`${submitted.stdout}${submitted.stderr}`).toContain("pre-publication obligations remain open");
  });
});
