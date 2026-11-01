/** Fallback weights for project files with no recorded duration, in milliseconds of Linux duration. */
export const PROJECT_DURATION_ESTIMATES: Readonly<Record<string, number>> = {
  // Hosted reference medians.
  "integration": 995.0,
  "e2e": 12739.0,
  "unit": 7.0,
  "unit-mocks": 32.0,
  // These run one file at a time after their shard's parallel work, and only in the portability jobs, which record no
  // durations. The burst suite's weight exceeds a shard's share of the portability set's Linux load, so it gets a
  // shard of its own; the timing suite's keeps its shard a little lighter. On hosted Windows they take 5–10 min and
  // about 1 min.
  "integration-timing": 33000.0,
  "integration-bursts": 270000.0
};
