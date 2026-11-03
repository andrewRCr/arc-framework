/** Fallback weights for project files with no recorded duration, in milliseconds of Linux duration. */
export const PROJECT_DURATION_ESTIMATES: Readonly<Record<string, number>> = {
  // Hosted reference medians.
  "integration": 995.0,
  "e2e": 12739.0,
  "unit": 7.0,
  "unit-mocks": 32.0,
  // These run one file at a time after their shard's parallel work, and only in the portability jobs. Until a job's
  // duration file records them, these stand in as shard weights and take no serial multiplier. The burst suite's weight
  // exceeds a shard's share of the portability set's Linux load, so it gets a shard of its own; the timing suite's keeps
  // its shard a little lighter. On hosted Windows they take 5–10 min and about 1 min.
  "integration-timing": 33000.0,
  "integration-bursts": 270000.0
};

/**
 * Multipliers for the recorded durations of projects whose files run one at a time after their shard's parallel work.
 * Parallel files share a shard's workers, so a serial file holds its shard about as many times longer as there are
 * workers. The factor is the hosted runners' worker count, fixed rather than read from the machine so that every
 * shard of a run computes the same assignment.
 */
export const SERIAL_PROJECT_WEIGHTS: Readonly<Record<string, number>> = {
  "integration-timing": 3,
  "integration-bursts": 3,
};
