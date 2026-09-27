/** Stage the published singleton boundary that follows one verified Candidate review response. */

import type { GitExec } from "../../../lib/git/exec.js";
import type { CandidateReviewResponseEvidenceV1 } from
  "../../../lib/work-unit/candidate-attestation.js";
import {
  SubmissionBoundaryVersionConflictError,
  readSubmissionBoundaryVersioned,
  resolveSubmissionBoundaryPath,
  writeSubmissionBoundary,
} from "../../../lib/work-unit/submission-boundary-store.js";
import { rebindSingletonPublicationResponseBoundary } from
  "../policy/integration-boundary-locus.js";

/**
 * Bind an approved review response to the public singleton record and stage its exact boundary.
 *
 * @param input - Checkout, Git adapter, work unit, response, and hosted-publication requirement.
 * @returns After the boundary has been written when needed and staged for the fix commit.
 */
export async function stageSingletonPublicationResponse(input: {
  cwd: string;
  exec: GitExec;
  workUnit: string;
  response: CandidateReviewResponseEvidenceV1;
  requirePublished: boolean;
}): Promise<void> {
  const snapshot = await readSubmissionBoundaryVersioned(input.cwd, input.workUnit);
  const rebound = rebindSingletonPublicationResponseBoundary({
    stored: snapshot.boundary,
    workUnit: input.workUnit,
    response: input.response,
    requirePublished: input.requirePublished,
  });
  if (rebound === null) return;
  let path = resolveSubmissionBoundaryPath(input.workUnit);
  if (rebound !== snapshot.boundary) {
    try {
      path = await writeSubmissionBoundary(input.cwd, rebound, snapshot.version);
    } catch (error) {
      if (error instanceof SubmissionBoundaryVersionConflictError) {
        throw new Error("The singleton publication boundary moved during the review response. "
          + "Replay the approved response against its current boundary.", { cause: error });
      }
      throw error;
    }
  }
  await input.exec("git", ["add", "--", path], { cwd: input.cwd });
}
