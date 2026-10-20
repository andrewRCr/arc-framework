/** Stage the published singleton boundary that follows one verified Candidate review response. */

import { resolveReviewInvocation, type ReviewInvocationInput } from "./invocation.js";
import type { CandidateReviewResponseEvidenceV1 } from
  "../../../lib/work-unit/candidate-attestation.js";
import {
  SubmissionBoundaryVersionConflictError,
  readSubmissionBoundaryVersioned,
  writeSubmissionBoundary,
} from "../../../lib/store/kinds/review/integration-boundary/access.js";
import { resolveSubmissionBoundaryPath } from "../../../lib/store/kinds/review/paths.js";
import { rebindSingletonPublicationResponseBoundary } from
  "../policy/integration-boundary-locus.js";

/**
 * Bind an approved review response to the public singleton record and stage its exact boundary.
 *
 * @param input - Checkout, Git adapter, work unit, response, and hosted-publication requirement.
 * @returns After the boundary has been written when needed and staged for the fix commit.
 */
export async function stageSingletonPublicationResponse(input: ReviewInvocationInput & {
  workUnit: string;
  response: CandidateReviewResponseEvidenceV1;
  requirePublished: boolean;
}): Promise<void> {
  const invocation = resolveReviewInvocation(input);
  const access = { store: invocation.store, owner: invocation.workItem };
  const snapshot = await readSubmissionBoundaryVersioned(input.cwd, input.workUnit, access);
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
      path = await writeSubmissionBoundary(input.cwd, rebound, snapshot.version, access);
    } catch (error) {
      if (error instanceof SubmissionBoundaryVersionConflictError) {
        throw new Error("The singleton publication boundary moved during the review response. "
          + "Replay the approved response against its current boundary.", { cause: error });
      }
      throw error;
    }
  }
  if (!invocation.store.capabilities.stateOffBranch) {
    await input.exec("git", ["add", "--", path], { cwd: input.cwd });
  }
}
