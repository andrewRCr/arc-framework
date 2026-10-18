/** Singleton coverage continuations remain distinct from unavailable discharge positions. */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { canonicalDigest } from "../../../../src/lib/kernel/index.js";
import { readConfigSettings } from "../../../../src/lib/config/status-reader.js";
import { CandidateManagedRecordV1Schema, createCandidateAttestation, createCandidateSubjectSnapshot }
  from "../../../../src/lib/work-unit/candidate-attestation.js";
import { createStandardReviewReservation } from "../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { deriveReviewNextPassContext } from "../../../../src/scripts/review-gate/policy/review-next-pass.js";
import { resolveReviewPolicy } from "../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { composePublishedSingletonReview } from "../../../../src/scripts/review-gate/status-singleton.js";
import { composeSingletonReviewObligation, resolveReviewStatus, type RoutedReviewObligation } from "../../../../src/scripts/review-gate/status.js";
import { createHostedHandleFixture } from "../../../fixtures/hosted-review.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const subject = createCandidateSubjectSnapshot([{ path: "source.ts", digest: canonicalDigest({ source: 1 }),
  mode: "100644", treatment: "reviewable" }]);
const attestation = createCandidateAttestation({ workUnit: "example", subject, baseRevision: "a".repeat(40),
  attestedBy: "owner", attestedAt: "2026-10-18T00:00:00Z", verificationEvidenceRef: "test://verified" });
const record = CandidateManagedRecordV1Schema.parse({ schemaVersion: 1, semanticsVersion: "candidate-attestation/v1",
  attestation, subject, transitions: [], lineageAttestations: [] });
const handle = createHostedHandleFixture({ provider: "codex-pr", lineage: { kind: "candidate", candidateId: attestation.candidateId } });
const target = { repository: handle.target.repository, headRef: "feat/example", headSha: handle.target.headSha };
const requirement = handle.admission.requirement;
const standardReview = { obligation: requirement.obligation, reasons: requirement.reasons,
  rubricVersion: requirement.rubricVersion, rubricDigest: requirement.rubricDigest,
  retrigger: requirement.retrigger, count: requirement.count };
const reservation = createStandardReviewReservation({ candidateId: attestation.candidateId, sourceId: "codex-pr",
  sources: ["codex-pr", "delegated-agent"], target: { kind: "pinned-head", repository: target.repository, headSha: target.headSha },
  obligation: standardReview });
const nextPassContext = { completePasses: 0, convergence: "unconverged" as const, responseDue: false, incremental: null };
function coveragePolicy(sources: readonly string[] = reservation.sources) {
  const policy = resolveReviewPolicy({ schemaVersion: 1, target: handle.target, lane: "standard", standardReview,
    sources, maxPasses: 4, completedPasses: 1, nextPassContext,
    attempts: [{ sourceId: sources.includes("codex-pr") ? "codex-pr" : "delegated-agent",
      outcome: "findings", reviewOperationId: "earlier-fix-check" }],
    verifiedTerminalSignal: { reviewOperationId: "earlier-fix-check", confirmedFindingCount: 1,
      maxConfirmedSeverity: "major", materialFix: true, effectiveCoverage: "incremental" as const, coverageAdequate: false } });
  expect(policy).toMatchObject({ state: "coverage-required" });
  return policy;
}
async function status(routedObligation: RoutedReviewObligation) {
  return resolveReviewStatus({ target }, { observe: async () => ({ actualHeadSha: target.headSha,
    currentBaseOid: "a".repeat(40), baseContained: true, requiredChecks: "green", routedObligation }) });
}

it.each(["coverage-required", "unconfigured", "conflicting-coverage", "incomplete-evidence"] as const)(
  "routes only the terminal coverage state to local prepare: %s", async state => {
    const cwd = await mkdtemp(join(tmpdir(), "arc-singleton-coverage-")); roots.push(cwd);
    const currentReservation = state === "unconfigured" ? createStandardReviewReservation({ candidateId: attestation.candidateId,
      sourceId: "codex-pr", sources: ["codex-pr"], target: reservation.target, obligation: standardReview }) : reservation;
    await mkdir(join(cwd, ".arc/system"), { recursive: true });
    await writeFile(join(cwd, ".arc/system/arc-config.yml"),
      `review.standard_sources: [${currentReservation.sources.join(", ")}]\nreview.standard_max_passes: 4\n`);
    const readDischarge = Object.assign(async () => ({ discharged: false, nextSource: null,
      detail: state === "coverage-required" ? "The settled terminal needs coverage." : state,
      ...(state === "coverage-required" || state === "unconfigured" ? { terminalPolicyState: coveragePolicy(currentReservation.sources).state,
        completedPasses: 1, requestAttempts: [], nextPassContext } : {}),
    }), { confirmIncrementalApplicability: async () => "applicable" as const,
      confirmCurrentIncrementalApplicability: async () => "applicable" as const });
    const obligation = await composePublishedSingletonReview({ cwd,
      exec: async () => { throw new Error("No Git read is needed for a fresh continuation with supplied context."); },
      settings: (await readConfigSettings(cwd)).settings,
      reservation: currentReservation,
      record, workUnit: "example",
      recordVersion: canonicalDigest({ version: 1 }), baseRevision: "a".repeat(40), target: handle.target,
      statusRoute: { kind: "target", target }, readDischarge });
    const result = await status(obligation);
    expect(result).toMatchObject(state === "unconfigured" ? { state: "blocked", reason: "material-fix-local-source-unconfigured" }
      : { nextAction: state === "coverage-required" ? "review-singleton-local-prepare" : "run-review" });
  });

it("names ordinary local prepare for a settled coverage-required admission", async () => {
  const policy = coveragePolicy();
  const obligation = composeSingletonReviewObligation({ discharge: { discharged: false,
    detail: "The settled terminal needs coverage.", terminalPolicyState: policy.state },
    applicabilityContext: { workUnitId: "example", candidateId: attestation.candidateId,
      expectedRecordVersion: canonicalDigest({ version: 1 }) },
    request: { target: handle.target, admission: policy, sourceId: "delegated-agent", coverage: "complete", standardReview },
  });
  await expect(status(obligation)).resolves.toMatchObject({ nextAction: "review-singleton-local-prepare",
    action: { sourceId: "delegated-agent", standardReview } });
});

it.each(([undefined, "complete", "incremental"] as const).flatMap(coverage =>
  (["fresh", "settled"] as const).map(stage => ({ coverage, stage }))))(
  "keeps singleton local coverage selection in prepare: coverage=$coverage stage=$stage", async ({ coverage, stage }) => {
    const cwd = await mkdtemp(join(tmpdir(), "arc-singleton-local-coverage-")); roots.push(cwd);
    await mkdir(join(cwd, ".arc/system"), { recursive: true });
    await writeFile(join(cwd, ".arc/system/arc-config.yml"),
      "review.standard_sources: [delegated-agent]\nreview.standard_max_passes: 4\n");
    const localReservation = createStandardReviewReservation({ candidateId: attestation.candidateId,
      sourceId: "delegated-agent", sources: ["delegated-agent"], target: reservation.target, obligation: standardReview });
    const freshContext = await deriveReviewNextPassContext({ completePasses: 0, completedPasses: 0, predecessor: null, currentTarget: handle.admission.reviewTarget,
      currentLineage: handle.admission.lineage, standardReview,
      resultReader: { readResult: async () => { throw new Error("No predecessor exists."); } },
      dispositionStore: { readDispositionRecord: async () => null,
        appendDispositionRecord: async () => { throw new Error("Read-only context."); } },
      readResponsePerformance: async () => null });
    const readDischarge = Object.assign(async () => ({ discharged: false, nextSource: "delegated-agent",
      detail: "The singleton requires a fresh local pass.", requestCoverage: "complete" as const,
      completedPasses: stage === "fresh" ? 0 : 1, requestAttempts: [],
      nextPassContext: stage === "fresh" ? freshContext : nextPassContext,
      ...(stage === "fresh" ? {} : { terminalPolicyState: coveragePolicy(localReservation.sources).state }) }), {
      confirmIncrementalApplicability: async () => "unavailable" as const,
      confirmCurrentIncrementalApplicability: async () => "unavailable" as const,
    });
    const obligation = await composePublishedSingletonReview({ cwd,
      exec: async () => { throw new Error("A fresh local continuation needs no Git evidence."); },
      settings: (await readConfigSettings(cwd)).settings, reservation: localReservation,
      record, workUnit: "example", recordVersion: canonicalDigest({ version: 1 }), baseRevision: "a".repeat(40),
      target: handle.target, statusRoute: { kind: "target", target }, readDischarge,
      ...(coverage === undefined ? {} : { judgment: { coverage } }),
    });
    const result = await status(obligation);
    if (coverage === undefined) {
      expect(result).toMatchObject({ nextAction: "review-singleton-local-prepare" });
      return;
    }
    expect(result).toMatchObject({ state: "blocked", nextAction: "stop", reason: "singleton-local-coverage-required",
      remedy: { argv: ["arc", "review", "status", "--target", JSON.stringify(target)] } });
    if (result.state !== "blocked" || !("remedy" in result)) throw new Error("expected coverage remedy");
    expect(result.remedy.text).toContain("coverageAdmission");
    expect(result.remedy.text).toContain("local prepare");
  });
