/**
 * Corrective guidance carried on every integration-spine refusal.
 *
 * A refusal states the invariant it failed and the one command that advances
 * from it. The spine verbs are idempotent, so for an invariant the operator
 * satisfies by hand — composing Completion Notes, explaining a lineage delta —
 * the corrective command is the re-attempt that observes the same resume point,
 * not a verb that pretends to author the missing work.
 *
 * @module
 */

import { z } from "zod";

/** One refusal's failed invariant and the single command that advances from it. */
export const SpineRemedySchema = z.strictObject({
  /** The invariant the refusal enforced, in the operator's terms. */
  invariant: z.string().min(1),
  /** Render-verbatim guidance naming the corrective command. */
  text: z.string().min(1),
  /** The corrective command as argv — executable without shell reconstruction. */
  argv: z.array(z.string().min(1)).min(1),
});
export type SpineRemedy = z.infer<typeof SpineRemedySchema>;

/**
 * Compose a remedy from its invariant, corrective sentence, and argv.
 *
 * @param invariant - The invariant the refusal enforced.
 * @param correction - What the operator does before re-attempting, as a sentence fragment.
 * @param argv - The corrective command.
 * @returns The validated remedy.
 */
export function spineRemedy(invariant: string, correction: string, argv: readonly string[]): SpineRemedy {
  return SpineRemedySchema.parse({
    invariant,
    text: `${invariant} ${correction}: \`${argv.join(" ")}\`.`,
    argv: [...argv],
  });
}

/** The idempotent checkpoint re-attempt — the resume point for a hand-satisfied invariant. */
export function checkpointResumeArgv(workUnit: string): readonly string[] {
  return ["arc", "integrate", "checkpoint", workUnit, "--json"];
}

/** The Candidate re-attestation verb. */
export function proposeArgv(workUnit: string): readonly string[] {
  return ["arc", "propose", workUnit];
}

/**
 * The deliberate re-rooting invocation.
 *
 * The escape from a delta no approved response explains: a bare re-attestation reads the same
 * unexplained delta and refuses again, so the corrective command has to be the one that establishes a
 * new lineage root over freshly verified content.
 */
export function proposeNewRootArgv(workUnit: string): readonly string[] {
  return ["arc", "propose", workUnit, "--new-root"];
}
