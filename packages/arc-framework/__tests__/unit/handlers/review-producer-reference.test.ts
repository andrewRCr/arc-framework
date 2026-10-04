import { describe, expect, it } from "vitest";

import { createHostedHandleFixture, createHostedTerminalAttemptFixture } from
  "../../fixtures/hosted-review.js";
import { handleReviewResolve } from "../../../src/handlers/review.js";
import { LaneProgressStateSchema } from
  "../../../src/scripts/review-gate/core/operation-state-schema.js";
import { LocalReviewResultReader } from
  "../../../src/scripts/review-gate/hosts/local/review-result-reader.js";
import { resolveEvidenceBoundReviewPolicy } from
  "../../../src/scripts/review-gate/policy/review-policy-evidence.js";

describe("hosted producer reference refusals", () => {
  it.each(["result-digest", "unknown-hosted", "malformed-hosted"])(
    "recovers from a %s reference by using the sealed producer identity",
    async (referenceKind) => {
      const handle = createHostedHandleFixture();
      const terminal = createHostedTerminalAttemptFixture({
        admission: handle.admission, artifact: handle.artifact, outcome: "clean",
      });
      const lane = LaneProgressStateSchema.parse({
        schemaVersion: 1, semanticsVersion: "review-operation/v1",
        operationId: "lane-progress-hosted", updatedAt: "2026-10-03T12:00:00Z",
        kind: "lane-progress", lane: "standard", repositoryId: handle.admission.repositoryId,
        lineage: handle.admission.lineage, completedPasses: 1,
        attempts: [{
          attemptId: terminal.attemptId, logicalPass: 1, retryGeneration: 0,
          changeRequestId: "pull/42", headSha: handle.target.headSha, terminalProducer: true,
          sourceId: handle.provider, outcome: "clean", hosted: terminal.hosted,
        }],
      });
      const reader = new LocalReviewResultReader({
        operationIndex: {
          readOperationSnapshot: async () => ({ status: "complete", records: [{ version: 3, state: lane }] }),
        },
        receiptIndex: { readReceiptEntries: async () => [], readReceiptReference: async () => null },
        sourceStore: { readSource: async () => null, appendSource: async () => { throw new Error("not used"); } },
        outcomeStore: {
          readOutcome: async () => ({ version: 0, record: null, outcomeRef: null }),
          appendOutcome: async () => { throw new Error("not used"); },
        },
      });
      const requirement = handle.admission.requirement;
      const request = {
        schemaVersion: 1, target: handle.target, lane: "standard", frontlineActive: false,
        standardReview: {
          obligation: requirement.obligation, reasons: requirement.reasons,
          rubricVersion: requirement.rubricVersion, rubricDigest: requirement.rubricDigest,
          retrigger: requirement.retrigger, count: requirement.count,
        },
        completedPasses: 1,
        attempts: [{ sourceId: handle.provider, outcome: "clean", reviewOperationId:
          referenceKind === "result-digest" ? terminal.hosted.sealedResult?.hostedResultId
            : referenceKind === "unknown-hosted" ? `hosted/${"0".repeat(64)}` : "hosted/not-an-attempt" }],
      };
      const resolve = async (submitted: unknown) => {
        const output: string[] = [];
        const exitCodes: number[] = [];
        await handleReviewResolve("-", {
          resolveRoot: () => "/trusted-repository",
          readText: async () => JSON.stringify(submitted),
          resolve: (parsed) => resolveEvidenceBoundReviewPolicy(parsed, {
            sources: [handle.provider], maxPasses: 2, resultReader: reader,
            confirmTarget: async () => handle.admission.reviewTarget,
            dispositionStore: {
              readDispositionRecord: async () => null,
              appendDispositionRecord: async () => { throw new Error("not used"); },
            },
          }),
          write: (text) => output.push(text), setExitCode: (code) => exitCodes.push(code),
        });
        return { result: JSON.parse(output.join("")) as unknown, exitCodes };
      };

      const refusal = await resolve(request);
      expect(refusal).toMatchObject({
        exitCodes: [1], result: {
          mode: "review-resolve", error: { code: "invalid-input",
            message: expect.stringContaining("original acknowledged action") },
        },
      });
      expect(refusal.result).not.toHaveProperty("remedy");
      await expect(resolve({
        ...request,
        attempts: [{ sourceId: handle.provider, outcome: "clean", reviewOperationId: terminal.attemptId }],
      })).resolves.toMatchObject({
        exitCodes: [], result: { state: "pass-complete", nextAction: "none" },
      });
    },
  );
});
