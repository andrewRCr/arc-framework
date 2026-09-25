/**
 * Collect a Candidate subject as a fixture, where a refusal is a broken arrangement rather than an outcome.
 *
 * Most cases want a subject to build a Candidate record or a comparison from, and reach the collector only to
 * get one. For those the refusal arm is not a result under test — it means the fixture's history is not the one
 * the case meant to arrange, which is worth saying loudly and in one place. A case that reads the refusal
 * itself calls the collector directly.
 *
 * @module
 */

import type { CandidateLineageTarget } from "../../src/lib/work-unit/candidate-attestation.js";
import {
  collectGitCandidateSubject,
  type CollectGitCandidateTargetInput,
} from "../../src/lib/work-unit/git-candidate-subject.js";

/**
 * Collect the subject one fixture arranged, failing the case when there is none to collect.
 *
 * @param input - The same collection input the reader takes.
 * @returns The collected subject.
 */
export async function collectCandidateSubjectTarget(
  input: CollectGitCandidateTargetInput,
): Promise<CandidateLineageTarget> {
  const collection = await collectGitCandidateSubject(input);
  if (collection.status !== "collected") {
    throw new Error(`the fixture arranged a history whose subject was refused as ${collection.reason}`);
  }
  return collection.target;
}
