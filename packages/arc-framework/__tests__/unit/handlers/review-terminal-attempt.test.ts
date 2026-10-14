import { describe, expect, it } from "vitest";
import { createHostedHandleFixture, createHostedTerminalAttemptFixture } from "../../fixtures/hosted-review.js";
import { handleReviewResolve } from "../../../src/handlers/review.js";
import { ReviewCommandErrorEnvelopeSchema } from "../../../src/scripts/review-gate/core/review-command-envelope.js";
import { LaneProgressStateSchema } from "../../../src/scripts/review-gate/core/operation-state-schema.js";
import { ReviewCanonicalDigestSchema } from "../../../src/scripts/review-gate/core/gate-contract-v2-schema.js";
import type { ReviewResult } from "../../../src/scripts/review-gate/core/review-result.js";
import { LocalReviewResultReader } from "../../../src/scripts/review-gate/hosts/local/review-result-reader.js";
import { resolveEvidenceBoundReviewPolicy } from "../../../src/scripts/review-gate/policy/review-policy-evidence.js";
import { ReviewPolicyCommandRequestSchema, type ReviewPolicyCommandRequest } from
  "../../../src/scripts/review-gate/policy/review-policy-driver.js";

function fixture() {
  const handles = [1, 2].map(logicalPass => createHostedHandleFixture({ provider: "codex-pr", logicalPass }));
  const attempts = handles.map(handle => {
    const terminal = createHostedTerminalAttemptFixture({ admission: handle.admission, artifact: handle.artifact, outcome: "clean" });
    return { attemptId: terminal.attemptId, logicalPass: handle.admission.logicalPass, retryGeneration: 0,
      changeRequestId: "pull/42", headSha: handle.target.headSha, terminalProducer: true,
      sourceId: handle.provider, outcome: "clean", hosted: terminal.hosted };
  });
  const handle = handles[1]!;
  const lane = LaneProgressStateSchema.parse({
    schemaVersion: 1, semanticsVersion: "review-operation/v1", operationId: "lane-progress-hosted",
    updatedAt: "2026-10-13T00:00:00Z", kind: "lane-progress", lane: "standard",
    repositoryId: handle.admission.repositoryId, lineage: handle.admission.lineage, completedPasses: 2, attempts,
  });
  const reader = new LocalReviewResultReader({
    operationIndex: { readOperationSnapshot: async () => ({ status: "complete", records: [{ version: 3, state: lane }] }) },
    receiptIndex: { readReceiptEntries: async () => [], readReceiptReference: async () => null },
    sourceStore: { readSource: async () => null, appendSource: async () => { throw new Error("not used"); } },
    outcomeStore: {
      readOutcome: async () => ({ version: 0, record: null, outcomeRef: null }),
      appendOutcome: async () => { throw new Error("not used"); },
    },
  });
  const requirement = handle.admission.requirement;
  const request = ReviewPolicyCommandRequestSchema.parse({
    schemaVersion: 1, target: handle.target, lane: "standard", frontlineActive: true,
    standardReview: { obligation: requirement.obligation, reasons: requirement.reasons,
      rubricVersion: requirement.rubricVersion, rubricDigest: requirement.rubricDigest,
      retrigger: requirement.retrigger, count: requirement.count },
    completedPasses: 2, attempts: [{ sourceId: handle.provider, outcome: "clean", reviewOperationId: attempts[1]!.attemptId }],
    scopeSelection: { mode: "whole-target", target: handle.target }, invocation: { mode: "force", sourceId: "codex-pr" },
  });
  return { reader, request, target: handle.admission.reviewTarget };
}

async function resolve(submitted: unknown, fault?: (result: ReviewResult) => ReviewResult,
  sources: readonly string[] = ["codex-pr", "coderabbit-pr"]) {
  const { reader, target } = fixture();
  const output: string[] = [];
  const exitCodes: number[] = [];
  await handleReviewResolve("-", {
    resolveRoot: () => "/trusted-repository", readText: async () => JSON.stringify(submitted),
    resolve: parsed => resolveEvidenceBoundReviewPolicy(parsed, {
      sources, maxPasses: 2,
      resultReader: { readResult: async id => { const result = await reader.readResult(id); return fault?.(result) ?? result; } },
      confirmTarget: async () => target,
      dispositionStore: { readDispositionRecord: async () => null, appendDispositionRecord: async () => { throw new Error("not used"); } },
    }),
    write: text => output.push(text), setExitCode: code => exitCodes.push(code),
  });
  return { result: JSON.parse(output.join("")) as unknown, exitCodes };
}

type Mutation = { name: string; expected: string; change: (request: ReviewPolicyCommandRequest) => unknown };
const mutations: Mutation[] = [
  { name: "short pass count", expected: "completedPasses", change: request => ({ ...request, completedPasses: 1 }) },
  { name: "excess pass count", expected: "completedPasses", change: request => ({ ...request, completedPasses: 3 }) },
  { name: "outcome", expected: "outcome", change: request => ({ ...request,
    attempts: request.attempts.map(attempt => ({ ...attempt, outcome: "findings" })) }) },
  { name: "source", expected: "sourceId", change: request => ({ ...request,
    attempts: request.attempts.map(attempt => ({ ...attempt, sourceId: "coderabbit-pr" })) }) },
  { name: "lane", expected: "lane", change: request => ({ ...request, lane: "frontline", invocation: undefined }) },
  { name: "scope", expected: "scopeSelection", change: request => ({ ...request,
    scopeSelection: { mode: "chunked", target: request.target } }) },
  { name: "rubric", expected: "standardReview", change: request => ({ ...request,
    standardReview: { ...request.standardReview, rubricDigest: `sha256:${"0".repeat(64)}` } }) },
];

describe("terminal review attempt input recovery", () => {
  it.each(mutations)("refuses a wrong $name with a corrected request that succeeds", async ({ expected, change }) => {
    const { request } = fixture();
    const refusal = await resolve(change(request));
    expect(refusal.exitCodes).toEqual([1]);
    const error = ReviewCommandErrorEnvelopeSchema.parse(refusal.result);
    expect(error.error.code).toBe("invalid-input");
    if (!("remedy" in error) || error.remedy === undefined) throw new Error("expected a corrected-input remedy");
    expect(error.remedy.text).toContain(expected);
    expect(error.remedy.argv).toEqual(["arc", "review", "resolve", "-"]);
    const corrected = ReviewPolicyCommandRequestSchema.parse(error.remedy.stdin);
    const { invocation: _invocation, ...expectedRequest } = request;
    expect(corrected).toMatchObject(expectedRequest);
    expect(corrected.invocation).toEqual(expected === "lane" ? undefined : _invocation);
    await expect(resolve(corrected)).resolves.toMatchObject({
      exitCodes: [], result: { state: "pass-complete", nextAction: "none",
        payload: { completedPasses: 2, verifiedTerminalSignal: { confirmedFindingCount: 0, coverageAdequate: true } } },
    });
  });

  it.each(["duplicate source", "wrong lane", "later source", "compatible prefix"])(
    "replays a corrected terminal attempt with %s fallback history", async name => {
      const { request } = fixture();
      const fallback = { sourceId: name === "wrong lane" ? "coderabbit-cli"
        : name === "duplicate source" ? "codex-pr" : "coderabbit-pr", outcome: "rate-limited" as const };
      const terminal = { ...request.attempts[0], sourceId: "delegated-agent" };
      const submitted = { ...request, lane: name === "wrong lane" ? "frontline" : "standard",
        ...(name === "wrong lane" ? { invocation: undefined } : {}), attempts: [fallback, terminal] };
      const sources = name === "compatible prefix" ? ["coderabbit-pr", "codex-pr", "delegated-agent"]
        : ["codex-pr", "coderabbit-pr", "delegated-agent"];
      const refusal = await resolve(submitted, undefined, sources);
      const error = ReviewCommandErrorEnvelopeSchema.parse(refusal.result);
      expect(error.error.code).toBe("invalid-input");
      if (!("remedy" in error) || error.remedy === undefined) throw new Error("expected a corrected-input remedy");
      const corrected = ReviewPolicyCommandRequestSchema.parse(error.remedy.stdin);
      expect(corrected.attempts).toEqual([
        ...(name === "compatible prefix" ? [fallback] : []), ...request.attempts,
      ]);
      expect(corrected.completedPasses).toBe(request.completedPasses);
      expect(corrected.target).toEqual(request.target);
      await expect(resolve(corrected, undefined, sources)).resolves.toMatchObject({ exitCodes: [],
        result: { state: "pass-complete", nextAction: "none", payload: { completedPasses: 2 } } });
    },
  );

  it.each([
    ["identity", (result: ReviewResult): ReviewResult => ({ ...result, producerId: "hosted/wrong-id" })],
    ["policy", (result: ReviewResult): ReviewResult => ({ ...result, admission: { ...result.admission, policyVersion: ReviewCanonicalDigestSchema.parse(`sha256:${"0".repeat(64)}`) } })],
    ["finding set", (result: ReviewResult): ReviewResult => ({ ...result, findings: [{ findingId: "unexpected", severity: "minor",
      locus: "src/example.ts:1", evidenceUrlOrId: "unexpected", sourceOrdinal: 1 }] })],
  ] as const)("keeps producer %s disagreement unexpected even with a wrong caller pass count", async (_name, fault) => {
    const { request } = fixture();
    const refusal = await resolve({ ...request, completedPasses: 1 }, fault);
    expect(refusal).toMatchObject({ exitCodes: [1], result: { error: { code: "unexpected-failure" } } });
    expect(refusal.result).not.toHaveProperty("remedy");
  });
});
