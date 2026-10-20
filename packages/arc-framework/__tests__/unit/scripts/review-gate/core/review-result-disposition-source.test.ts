/** Source validation retains the context supplied by a selected immutable result reader. */
import { expect, it } from "vitest";
import { OwnerIdentitySchema } from "../../../../../src/lib/store/identity.js";
import { findingsHostedResult, approvedRecord } from "../../../../fixtures/review-response-proof.js";
import { bindReviewSourceReference } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { validateApprovedDispositionRecordForResult } from "../../../../../src/scripts/review-gate/core/review-result-disposition.js";

it("validates a hosted approval source under its selected result owner", () => {
  const workItem = OwnerIdentitySchema.parse({ type: "work-item", name: "example", uid: "14bc6336-193b-4d7a-9380-1b4ca79a714b" });
  const result = { ...findingsHostedResult(["major"]), workItem };
  if (result.kind !== "hosted") throw new Error("Expected hosted result");
  const record = approvedRecord(result, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "defer" }]);
  const source = { kind: "hosted" as const, attemptRef: bindReviewSourceReference({ kind: "hosted", repositoryId: result.repositoryId,
    workItem, operationId: result.laneOperationId, durableRef: result.producerId }), hostedResultId: result.resultDigest };
  expect(validateApprovedDispositionRecordForResult({ ...record, source }, result)).toEqual({ ...record, source });
});

it.each(["foreign-project", "foreign-owner", "repository"] as const)("refuses a %s native approval source and accepts its correction", invalid => {
  const workItem = OwnerIdentitySchema.parse({ type: "work-item", name: "example", uid: "14bc6336-193b-4d7a-9380-1b4ca79a714b" });
  const producer = findingsHostedResult(["major"]);
  if (producer.kind !== "hosted") throw new Error("Expected hosted result");
  const result = invalid === "repository" ? producer : { ...producer, workItem };
  const original = approvedRecord(result, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "defer" }]);
  const source = { kind: "hosted" as const, attemptRef: bindReviewSourceReference({ kind: "hosted",
    repositoryId: invalid === "foreign-project" ? "another-project" : result.repositoryId,
    workItem: invalid === "foreign-owner" ? OwnerIdentitySchema.parse({ ...workItem, uid: "24bc6336-193b-4d7a-9380-1b4ca79a714b" }) : workItem,
    operationId: producer.laneOperationId, durableRef: result.producerId }), hostedResultId: result.resultDigest };
  expect(() => validateApprovedDispositionRecordForResult({ ...original, source }, result)).toThrow();
  const corrected = invalid === "repository" ? original : { ...original, source: { ...source,
    attemptRef: bindReviewSourceReference({ kind: "hosted", repositoryId: result.repositoryId, workItem,
      operationId: producer.laneOperationId, durableRef: result.producerId }) } };
  expect(validateApprovedDispositionRecordForResult(corrected, result)).toEqual(corrected);
});
