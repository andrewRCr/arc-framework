import { withReviewReport } from "../fixtures/review-report-input.js";
/** Real-CLI regression for review pass accounting across an explicit Candidate supersession. */

import { readResolveNextPassContext } from "../../src/handlers/review-next-pass-context.js";
import { createRepositoryReviewResultReader } from "../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, git, runArc, runArcWithStdin } from "./store-default.js";
import { gitExec } from "../../src/lib/io-context.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences, type OwnerIdentity } from "../../src/lib/store/identity.js";
import { CandidateManagedRecordV1Schema, type CandidateManagedRecordV1 } from
  "../../src/lib/work-unit/candidate-attestation.js";
import { createReviewCompositionContext } from "../../src/scripts/review-gate/runtime/composition-context.js";
import { responsePolicyRequest } from "../fixtures/review-response-policy.js";
import { readStoreRecord } from "../helpers/store/seed-store.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";

const OFFLINE_ORIGIN = "https://arc-fixture.invalid/arc-framework/example.git";
const OFFLINE_ENV = { GIT_TERMINAL_PROMPT: "0" };
const CLOSED_TASKS = "# Task List: Example\n\n## **Phase 1:** Verification\n\n### `[x]` **1.1 Verification complete**\n";
const IDENTITY = SlugSchema.parse("test-user");
const EXAMPLE = OwnerIdentitySchema.parse({ type: "work-item", name: "example" });

type Envelope = { state: string; nextAction: string; payload: Record<string, unknown> };
type LocalPreparation = {
  operationId: string;
  operationRef?: string;
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

/** The store writes its records off the branch, so a verb that records state leaves nothing staged and no commit lands. */
async function expectNothingStaged(root: string): Promise<void> {
  expect(await git(root, ["diff", "--cached", "--name-only"])).toBe("");
}

/** `example`'s owner identity as the store minted it, UID included. */
async function exampleOwner(root: string): Promise<OwnerIdentity> {
  return (await readStoreRecord(root, IDENTITY, recordReferences["work-item/meta"](EXAMPLE))).reference.owner;
}

/** Read `example`'s Candidate record and its version. */
async function readCandidate(root: string): Promise<{ record: CandidateManagedRecordV1; version: string }> {
  const held = await readStoreRecord(root, IDENTITY, recordReferences["review/candidate"](EXAMPLE));
  return { record: CandidateManagedRecordV1Schema.parse(JSON.parse(held.content)), version: held.version };
}

/** The review composition a production resolve builds for `example` from `root`. */
async function reviewComposition(root: string) {
  const composition = createReviewCompositionContext({ cwd: root, exec: gitExec, workItem: await exampleOwner(root) });
  if (composition.family.mode !== "stored") throw new Error("expected the store's review ports");
  return { ...composition, family: composition.family };
}

/** The operation a continuation names, with the owner-bearing reference its preparation emitted. */
function continuation(prepared: { operationId: string; operationRef?: string }): { operationId: string; operationRef?: string } {
  return { operationId: prepared.operationId,
    ...(prepared.operationRef === undefined ? {} : { operationRef: prepared.operationRef }) };
}

/** A verified work unit held in the store and bound in place on its branch, its implementation committed. */
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
  await git(root, ["add", ".arc", ".gitignore", ".ignore"]);
  await git(root, ["commit", "-m", "install ARC"]);
  await git(root, ["switch", "-c", "feat/example"]);
  await seedWorkUnit(root, "example", { identity: "test-user", branch: "feat/example", bind: root,
    meta: { state: "Active", owner: "test-user", branch: "feat/example", workClass: "Light", priority: "P2",
      taskList: "tasks-example.md", lastCompleted: "verification", nextAction: "verification complete" },
    taskList: CLOSED_TASKS });
  await writeFile(join(root, ".git", "info", "exclude"), ".arc/system/.internal/worktree-marker.json\n", { flag: "a" });
  await mkdir(join(root, "src"), { recursive: true });
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
    ...continuation(payload),
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
    ...continuation(payload),
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
  const proposed = await invoke(root, ["review", "respond", "-"], withReviewReport(baseRequest));
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
  const approved = await invoke(root, ["review", "respond", "-"], withReviewReport({
    schemaVersion: 1, source, policyRequest, dispositions,
  }));
  expect(approved).toMatchObject({ state: "ready-to-fix", nextAction: "apply-fix" });
  await writeFile(join(root, "src", "example.ts"), `export const example = ${replacement};\n`);
  await git(root, ["add", "src/example.ts"]);
  await git(root, ["commit", "-m", `apply review fix ${replacement}`]);
  const verified = await invoke(root, ["review", "respond", "-"], withReviewReport({
    schemaVersion: 1,
    source,
    policyRequest,
    dispositions,
    verifiedFix: {
      applicability: "focused",
      verificationEvidenceRefs: [`verification://focused-fix-${replacement}`],
    },
  }));
  expect(verified).toMatchObject({ state: "candidate-advanced", nextAction: "continue-review" });
  await expectNothingStaged(root);
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
    await expectNothingStaged(root);
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
    const { family } = await reviewComposition(root);
    const decisions = await family.ports.decisions.list();
    if (decisions.status !== "complete") throw new Error("review decisions unavailable");
    expect(decisions.records.filter(({ value }) => value.lane === "frontline" && value.choice.kind === "lane-skip"))
      .toHaveLength(1);
    const snapshot = await family.ports.inFlight.readOperationSnapshot();
    expect(snapshot.status).toBe("complete");
    if (snapshot.status !== "complete") throw new Error("review operation snapshot unavailable");
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
    await expectNothingStaged(root);
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

    const predecessor = await readCandidate(root);
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
      recordRevision: predecessor.version,
      nextAction: {
        kind: "recover-owning-branch-review",
        reviewArgv: ["arc", "review", "pre-publication", "example"],
      },
    });
    expect((await readCandidate(root)).record.attestation.candidateId).toBe(oldCandidateId);

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
    expect((await readCandidate(root)).record.attestation.supersedes).toBe(oldCandidateId);
    await expectNothingStaged(root);
    const previousRequest = await responsePolicyRequest(root, source);
    const { publisher, family, store, projectId, workItem } = await reviewComposition(root);
    const nextPassContext = await readResolveNextPassContext({ root, exec: gitExec, configuredSources: ["delegated-agent"],
      store, projectId, workItem, operationStore: family.ports.inFlight, dispositionStore: family.ports.dispositions,
      resultReader: createRepositoryReviewResultReader(publisher, { store, projectId, workItem }),
      request: { ...previousRequest, target: { ...previousRequest.target, headSha: await git(root, ["rev-parse", "HEAD"]) }, attempts: [] },
    });
    expect(nextPassContext).toEqual({ completePasses: 1, convergence: "unconverged", responseDue: false, incremental: null });

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
    await expectNothingStaged(root);

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
    const second = (await readCandidate(root)).record;
    expect(second.attestation.supersedes).toBe(firstCandidateId);
    expect(second.attestation.candidateId).not.toBe(firstCandidateId);
    await expectNothingStaged(root);
    await git(root, ["remote", "add", "origin", OFFLINE_ORIGIN]);

    const reviewed = await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled"],
      root,
      { env: OFFLINE_ENV },
    );
    expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
    expect(JSON.parse(reviewed.stdout)).toMatchObject({
      candidateId: second.attestation.candidateId,
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
