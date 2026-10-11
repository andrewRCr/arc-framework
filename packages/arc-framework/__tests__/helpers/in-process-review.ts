/** Review command handlers driven in this process, for setup a test does not assert on at the CLI boundary. */

import {
  handleReviewLocalAttest,
  handleReviewLocalPrepare,
  handleReviewReduce,
  handleReviewRespond,
} from "../../src/handlers/review.js";
import { attestLocalReviewCommand } from "../../src/scripts/review-gate/runtime/local-attest-command.js";
import { createLocalAttestDependencies } from "../../src/scripts/review-gate/runtime/local-attest-composition.js";
import { prepareLocalReview } from "../../src/scripts/review-gate/runtime/local-prepare.js";
import { createLocalPrepareDependencies } from "../../src/scripts/review-gate/runtime/local-prepare-composition.js";
import { reduceReviewCommand } from "../../src/scripts/review-gate/runtime/reduce-command.js";
import { createReduceDependencies } from "../../src/scripts/review-gate/runtime/reduce-composition.js";
import { respondToReviewCommand } from "../../src/scripts/review-gate/runtime/respond-command.js";
import { createRespondDependencies } from "../../src/scripts/review-gate/runtime/respond-composition.js";
import { makeGitExec } from "./integration.js";

/** One review command's JSON envelope. */
export interface InProcessReviewEnvelope {
  state: string;
  nextAction: string;
  payload: Record<string, unknown>;
}

/** The process boundary a review handler otherwise takes from its command line. */
interface ReviewHandlerBoundary {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  write(text: string): void;
  setExitCode(code: number): void;
}

async function invoke(
  root: string,
  request: unknown,
  handle: (boundary: ReviewHandlerBoundary) => Promise<void>,
): Promise<InProcessReviewEnvelope> {
  const output: string[] = [];
  const exits: number[] = [];
  await handle({
    resolveRoot: () => root,
    readText: async () => JSON.stringify(request),
    write: (text) => { output.push(text); },
    setExitCode: (code) => { exits.push(code); },
  });
  if (exits.length > 0) throw new Error(`review handler exited ${exits.join(", ")}: ${output.join("")}`);
  return JSON.parse(output.join("")) as InProcessReviewEnvelope;
}

/**
 * Review commands run through their own handlers, so each still parses its request and validates its envelope; only
 * the built CLI's process start, the dominant cost of a review command, is skipped.
 */
export const inProcessReview = {
  prepare: (root: string, request: unknown): Promise<InProcessReviewEnvelope> => invoke(root, request, (boundary) =>
    handleReviewLocalPrepare("-", { ...boundary, prepare: (input) =>
      prepareLocalReview(input, createLocalPrepareDependencies({ cwd: root, exec: makeGitExec(root) })) })),
  attest: (root: string, request: unknown): Promise<InProcessReviewEnvelope> => invoke(root, request, (boundary) =>
    handleReviewLocalAttest("-", { ...boundary, attest: (input) =>
      attestLocalReviewCommand(input, createLocalAttestDependencies({ cwd: root, exec: makeGitExec(root) })) })),
  reduce: (root: string, request: unknown): Promise<InProcessReviewEnvelope> => invoke(root, request, (boundary) =>
    handleReviewReduce("-", { ...boundary, reduce: (input) =>
      reduceReviewCommand(input, createReduceDependencies({ cwd: root, exec: makeGitExec(root) })) })),
  respond: (root: string, request: unknown): Promise<InProcessReviewEnvelope> => invoke(root, request, (boundary) =>
    handleReviewRespond("-", { ...boundary, respond: (input) =>
      respondToReviewCommand(input, createRespondDependencies({ cwd: root, exec: makeGitExec(root) })) })),
};

/** The fields of a prepared local review that its result must bind. */
export interface PreparedLocalReview {
  operationId: string;
  target: { targetId: string; headSha: string; headTree: string };
  request: { evaluatorIdentity: string };
  reviewerPayload: {
    sourceDigest: string;
    guidanceDigest: string;
    guidance: { rubricVersion: string; rubricDigest: string };
  };
}

/** One normalized local review finding. */
export interface LocalReviewFinding {
  findingId: string;
  severity: string;
  locus: string;
  evidenceUrlOrId: string;
}

/**
 * Bind a normalized local review result to the exact operation it reviews.
 *
 * @param prepared - The prepared operation's payload
 * @param reviewRunId - Evaluator run identity for the result
 * @param findings - Findings to report; none makes the result clean
 * @returns An attest request for that operation
 */
export function localReviewResult(
  prepared: PreparedLocalReview,
  reviewRunId: string,
  findings: readonly LocalReviewFinding[],
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    operationId: prepared.operationId,
    result: {
      status: "complete",
      result: findings.length === 0 ? "clean" : "findings",
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
      findings,
    },
  };
}
