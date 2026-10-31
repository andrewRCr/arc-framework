/**
 * The time limit test helpers give one child-process call: an `arc` run, a test controller run, or a CI preparation
 * step.
 *
 * A case that makes such calls allows itself this limit once per call plus once for its own setup, so on a slow runner
 * only a call that is itself too slow fails the case, and a hung call still fails at its own limit.
 */
export const CALL_LIMIT = 30_000;
