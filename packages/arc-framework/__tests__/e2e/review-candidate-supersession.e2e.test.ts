/** Real-CLI regression for review pass accounting across an explicit Candidate supersession. */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, git, runArc, runArcWithStdin } from "./helpers.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { gitExec } from "../../src/lib/io-context.js";
import { readCandidateRecord } from "../../src/lib/work-unit/candidate-record-store.js";
import { LocalReviewOperationStateStore } from
  "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { responsePolicyRequest } from "../fixtures/review-response-policy.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

const OFFLINE_ORIGIN = "https://arc-fixture.invalid/arc-framework/example.git";
const OFFLINE_ENV = { GIT_TERMINAL_PROMPT: "0" };
const META = makeMetaFixture("example", {
  owner: "test-user", branch: "feat/example", workClass: "Light", priority: "P2",
  taskList: "tasks-example.md", lastCompleted: "verification", nextAction: "verification complete",
});

type Envelope = { state: string; nextAction: string; payload: Record<string, unknown> };
type LocalPreparation = {
  operationId: string;
  target: { targetId: string; headSha: string; headTree: string };
  request: { evaluatorIdentity: string };
  reviewerPayload: {
    sourceDigest: string;
    guidanceDigest: string;
    guidance: { rubricVersion: string; rubricDigest: string };
  };
};
type FindingsSource = { kind: "attested-local"; receiptRef: string };

async function invoke(root: string, argv: string[], input: unknown): Promise<Envelope> {
  const result = await runArcWithStdin(argv, root, `${JSON.stringify(input)}\n`);
  expect(result.exitCode, JSON.stringify(result)).toBe(0);
  return JSON.parse(result.stdout) as Envelope;
}

async function fixture(): Promise<string> {
  const root = await createTempRepo("arc-candidate-supersession-");
  const initialized = await runArc(["init", "--yes", "--name", "example"], root);
  expect(initialized.exitCode, JSON.stringify(initialized)).toBe(0);
  const configPath = join(root, ".arc", "system", "arc-config.yml");
  await writeFile(
    configPath,
    (await readFile(configPath, "utf8")).replace(
      "review.standard_sources: []", "review.standard_sources: [delegated-agent]",
    ),
  );
  await git(root, ["add", ".arc", ".gitignore"]);
  await git(root, ["commit", "-m", "install ARC"]);
  await git(root, ["switch", "-c", "feat/example"]);
  await mkdir(join(root, ".arc", "active"), { recursive: true });
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, ".arc", "active", "meta-example.md"), META);
  await writeFile(
    join(root, ".arc", "active", "tasks-example.md"),
    "# Task List: Example\n\n- [x] Verification complete\n",
  );
  await writeFile(join(root, "src", "example.ts"), "export const example = 0;\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "implementation"]);
  return root;
}

async function materialReview(root: string, runId: string): Promise<FindingsSource> {
  const request = {
    schemaVersion: 1,
    evaluatorIdentity: `reviewer-${runId}`,
    routingFacts: {
      contentKind: "code-bearing",
      reviewRisk: "routine",
      changeDeterminacy: "ordinary",
      ownership: "self",
      surfaceAuthority: "ordinary",
    },
  };
  let prepared = await invoke(root, ["review", "local", "prepare", "-"], request);
  if (prepared.state === "coverage-required") {
    const action = prepared.payload.coverageSelectionAction as {
      choices: readonly { requestedCoverage: "incremental" | "complete" }[];
    };
    const complete = action.choices.find(({ requestedCoverage }) => requestedCoverage === "complete");
    if (complete === undefined) throw new Error("complete coverage was not offered");
    prepared = await invoke(root, ["review", "local", "prepare", "-"], {
      ...request,
      coverageAdmission: complete,
    });
  }
  expect(prepared).toMatchObject({ state: "ready", nextAction: "launch-review" });
  const payload = prepared.payload as unknown as LocalPreparation;
  await invoke(root, ["review", "local", "attest", "-"], {
    schemaVersion: 1,
    operationId: payload.operationId,
    result: {
      status: "complete",
      result: "findings",
      targetId: payload.target.targetId,
      headSha: payload.target.headSha,
      headTree: payload.target.headTree,
      rubricVersion: payload.reviewerPayload.guidance.rubricVersion,
      rubricDigest: payload.reviewerPayload.guidance.rubricDigest,
      sourceDigest: payload.reviewerPayload.sourceDigest,
      guidanceDigest: payload.reviewerPayload.guidanceDigest,
      evaluatorIdentity: payload.request.evaluatorIdentity,
      reviewRunId: runId,
      applicabilityId: null,
      findings: [{
        findingId: "finding-1",
        severity: "major",
        locus: "src/example.ts:1",
        evidenceUrlOrId: `review:${runId}`,
      }],
    },
  });
  const reduced = await invoke(root, ["review", "reduce", "-"], {
    schemaVersion: 1,
    operationId: payload.operationId,
  });
  expect(reduced).toMatchObject({ state: "findings", nextAction: "respond" });
  return (reduced.payload as { responseSource: FindingsSource }).responseSource;
}

async function settleFinding(root: string, source: FindingsSource, replacement: number): Promise<void> {
  const baseRequest = {
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
        rationale: "The reviewed source supports the correction.",
        recommendation: "Apply the correction.",
        openQuestions: [],
      }],
    },
  };
  const proposed = await invoke(root, ["review", "respond", "-"], baseRequest);
  expect(proposed).toMatchObject({ state: "awaiting-approval", nextAction: "obtain-approval" });
  const proposal = proposed.payload.proposal as {
    dispositionSet: { targetId: string; dispositionSetId: string };
  };
  const dispositions = {
    ...proposal,
    state: "approved",
    approval: {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: proposal.dispositionSet.targetId,
      dispositionSetId: proposal.dispositionSet.dispositionSetId,
      approvedBy: "test-user",
      approvedAt: "2026-09-25T12:00:00Z",
    },
  };
  const policyRequest = await responsePolicyRequest(root, source);
  const approved = await invoke(root, ["review", "respond", "-"], {
    schemaVersion: 1, source, policyRequest, dispositions,
  });
  expect(approved).toMatchObject({ state: "ready-to-fix", nextAction: "apply-fix" });
  await writeFile(join(root, "src", "example.ts"), `export const example = ${replacement};\n`);
  await git(root, ["add", "src/example.ts"]);
  await git(root, ["commit", "-m", `apply review fix ${replacement}`]);
  const verified = await invoke(root, ["review", "respond", "-"], {
    schemaVersion: 1,
    source,
    policyRequest,
    dispositions,
    verifiedFix: {
      applicability: "focused",
      verificationEvidenceRefs: [`verification://focused-fix-${replacement}`],
    },
  });
  expect(verified).toMatchObject({ state: "candidate-advanced", nextAction: "continue-review" });
  await git(root, ["commit", "-m", `record verified review response ${replacement}`]);
}

describe("Candidate review usage across supersession", () => {
  let root: string | undefined;
  afterEach(async () => {
    if (root !== undefined) await cleanupTempDir(root);
  });

  it("keeps an initial frontline skip closed across a fresh pre-publication process", async () => {
    root = await fixture();
    const attested = await runArc(["attest", "example", "--json"], root);
    expect(attested.exitCode, JSON.stringify(attested)).toBe(0);
    await git(root, ["commit", "-m", "attest initial candidate"]);
    await git(root, ["remote", "add", "origin", OFFLINE_ORIGIN]);

    const lanesPath = join(root, ".git", "initial-frontline-skip.json");
    await writeFile(lanesPath, JSON.stringify({
      frontline: { scopeMode: "whole-target", invocation: { mode: "skip" } },
      standard: { scopeMode: "whole-target" },
    }));
    const skipped = await runArc([
      "review", "pre-publication", "example", "--self-review", "settled",
      "--lanes", lanesPath,
    ], root, { env: OFFLINE_ENV });
    expect(skipped.exitCode, JSON.stringify(skipped)).toBe(0);
    expect(JSON.parse(skipped.stdout)).toMatchObject({
      locus: "candidate-review-pending",
      policy: { state: "ready", payload: { lane: "standard", pass: 1 } },
    });

    // Each runArc launches a new CLI process. No evaluator has yet entered standard review.
    const restarted = await runArc([
      "review", "pre-publication", "example", "--self-review", "settled",
    ], root, { env: OFFLINE_ENV });
    expect(restarted.exitCode, JSON.stringify(restarted)).toBe(0);
    expect(JSON.parse(restarted.stdout)).toMatchObject({
      locus: "candidate-review-pending",
      policy: { state: "ready", payload: { lane: "standard", pass: 1 } },
    });
    const store = new LocalReviewOperationStateStore(
      new RepositoryGitCommonStatePublisher(gitExec, root),
    );
    const snapshot = await store.readOperationSnapshot();
    expect(snapshot.status).toBe("complete");
    if (snapshot.status !== "complete") throw new Error("review operation snapshot unavailable");
    expect(snapshot.records.filter(({ state }) => state.kind === "frontline-phase")).toHaveLength(1);
    expect(snapshot.records.filter(({ state }) => state.kind === "local-review")).toHaveLength(0);
    expect(snapshot.records.filter(({ state }) => state.kind === "lane-progress"
      && state.attempts.length > 0)).toHaveLength(0);
  }, 120_000);

  it("refuses re-root until predecessor findings settle at their exact reviewed head", async () => {
    root = await fixture();
    const attested = await runArc(["attest", "example", "--json"], root);
    expect(attested.exitCode, JSON.stringify(attested)).toBe(0);
    const oldCandidateId = (JSON.parse(attested.stdout) as {
      locus: { candidateId: string };
    }).locus.candidateId;
    await git(root, ["commit", "-m", "attest predecessor candidate"]);
    const reviewHead = await git(root, ["rev-parse", "HEAD"]);
    const source = await materialReview(root, "live-predecessor-findings");

    await writeFile(join(root, "src", "example.ts"), "export const example = 7;\n");
    await git(root, ["add", "src/example.ts"]);
    await git(root, ["commit", "-m", "verified successor implementation"]);
    const defaultAttest = await runArc(["attest", "example", "--json"], root);
    expect(defaultAttest.exitCode).toBe(1);
    const blocked = JSON.parse(defaultAttest.stdout) as {
      status: string;
      nextAction: string;
      continuation: { argv: string[] };
    };
    expect(blocked).toMatchObject({ status: "blocked", nextAction: "establish-new-root" });

    const refused = await runArc(blocked.continuation.argv.slice(1), root);
    expect(refused.exitCode).toBe(1);
    const refusal = JSON.parse(refused.stdout) as {
      status: string;
      reason: string;
      candidateId: string;
      lane: string;
      outcome: string;
      reviewHeadSha: string;
      recordRevision: string;
      nextAction: { kind: string; reviewArgv: string[] };
    };
    expect(refusal).toMatchObject({
      status: "refused",
      reason: "re-root-live-review",
      candidateId: oldCandidateId,
      lane: "standard",
      outcome: "findings",
      reviewHeadSha: reviewHead,
      recordRevision: reviewHead,
      nextAction: {
        kind: "recover-owning-branch-review",
        reviewArgv: ["arc", "review", "pre-publication", "example"],
      },
    });
    expect((await readCandidateRecord(root, "example"))?.attestation.candidateId).toBe(oldCandidateId);

    const successorHead = await git(root, ["rev-parse", "HEAD"]);
    await git(root, ["branch", "fixture/successor", successorHead]);
    await git(root, ["reset", "--hard", reviewHead]);
    await settleFinding(root, source, 1);
    await git(root, [
      "merge", "--no-ff", "-X", "theirs", "fixture/successor", "-m", "merge verified successor",
    ]);

    // The merge carries both A's durable response transition and B's implementation. Its new
    // subject requires a fresh version-bound continuation rather than replaying B's old token.
    const mergedAttest = await runArc(["attest", "example", "--json"], root);
    expect(mergedAttest.exitCode).toBe(1);
    const mergedBlocked = JSON.parse(mergedAttest.stdout) as {
      status: string;
      nextAction: string;
      continuation: { argv: string[] };
    };
    expect(mergedBlocked).toMatchObject({
      status: "blocked", nextAction: "establish-new-root",
    });

    const resumed = await runArc(mergedBlocked.continuation.argv.slice(1), root);
    expect(resumed.exitCode, JSON.stringify(resumed)).toBe(0);
    expect(JSON.parse(resumed.stdout)).toMatchObject({ status: "attested", operation: "re-root" });
    expect((await readCandidateRecord(root, "example"))?.attestation.supersedes).toBe(oldCandidateId);
    await git(root, ["commit", "-m", "attest successor candidate"]);
    await git(root, ["remote", "add", "origin", OFFLINE_ORIGIN]);
    const continuation = await runArc([
      "review", "pre-publication", "example", "--self-review", "settled",
    ], root, { env: OFFLINE_ENV });
    expect(continuation.exitCode, JSON.stringify(continuation)).toBe(0);
    expect(JSON.parse(continuation.stdout)).toMatchObject({
      locus: "candidate-review-pending",
      policy: { state: "ready", payload: { lane: "standard", pass: 2 } },
    });
  }, 120_000);

  it("keeps two settled standard passes and frontline closure on a superseding root", async () => {
    root = await fixture();
    const first = await runArc(["attest", "example", "--json"], root);
    expect(first.exitCode, JSON.stringify(first)).toBe(0);
    const firstCandidateId = (JSON.parse(first.stdout) as {
      locus: { candidateId: string };
    }).locus.candidateId;
    await git(root, ["commit", "-m", "attest initial candidate"]);

    await settleFinding(root, await materialReview(root, "material-pass-1"), 1);
    await settleFinding(root, await materialReview(root, "material-pass-2"), 2);

    // This verified implementation edit is outside the preceding Candidate response. The public
    // attestation refusal supplies a version-bound continuation for deliberate supersession.
    await writeFile(join(root, "src", "example.ts"), "export const example = 3;\n");
    await git(root, ["add", "src/example.ts"]);
    await git(root, ["commit", "-m", "verified follow-up implementation"]);
    const initialReroot = await runArc(["attest", "example", "--json"], root);
    expect(initialReroot.exitCode).toBe(1);
    const refusal = JSON.parse(initialReroot.stdout) as {
      status: string;
      candidateId: string;
      nextAction: string;
      continuation: { argv: string[] };
    };
    expect(refusal).toMatchObject({
      status: "blocked",
      candidateId: firstCandidateId,
      nextAction: "establish-new-root",
    });
    expect(refusal.continuation.argv).toEqual([
      "arc", "attest", "example", "--new-root",
      "--expected-candidate", firstCandidateId,
      "--expected-subject", expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      "--json",
    ]);
    const rerooted = await runArc(refusal.continuation.argv.slice(1), root);
    expect(rerooted.exitCode, JSON.stringify(rerooted)).toBe(0);
    expect(JSON.parse(rerooted.stdout)).toMatchObject({ status: "attested", operation: "re-root" });
    const second = await readCandidateRecord(root, "example");
    expect(second?.attestation.supersedes).toBe(firstCandidateId);
    expect(second?.attestation.candidateId).not.toBe(firstCandidateId);
    await git(root, ["commit", "-m", "attest superseding candidate"]);
    await git(root, ["remote", "add", "origin", OFFLINE_ORIGIN]);

    const reviewed = await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled"],
      root,
      { env: OFFLINE_ENV },
    );
    expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
    expect(JSON.parse(reviewed.stdout)).toMatchObject({
      candidateId: second?.attestation.candidateId,
      locus: "candidate-review-pending",
      policy: {
        state: "approval-required",
        nextAction: "obtain-ceiling-override",
        payload: { consequence: { exhaustedPassCount: 2, nextPass: 3 } },
      },
    });
    expect(reviewed.stdout).not.toMatch(/frontline.*[Pp]ass 1/u);

    const replay = await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled"],
      root,
      { env: OFFLINE_ENV },
    );
    expect(replay.exitCode, JSON.stringify(replay)).toBe(0);
    expect(JSON.parse(replay.stdout)).toMatchObject({
      policy: {
        state: "approval-required",
        payload: { consequence: { exhaustedPassCount: 2, nextPass: 3 } },
      },
    });
  }, 120_000);
});
