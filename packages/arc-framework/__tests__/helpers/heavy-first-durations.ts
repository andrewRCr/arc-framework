/** Hosted reference medians for project fallback weights and recorded slow files. */
export const PROJECT_DURATION_ESTIMATES: Readonly<Record<string, number>> = {
  "integration": 995.0,
  "e2e": 12739.0,
  "unit": 7.0,
  "unit-mocks": 32.0
};

export const HAND_KEPT_DURATIONS: Readonly<Record<string, number>> = {
  "e2e:__tests__/e2e/candidate-lineage.e2e.test.ts": 254635.0,
  "e2e:__tests__/e2e/publication-spine.e2e.test.ts": 156052.0,
  "e2e:__tests__/e2e/errand.e2e.test.ts": 94341.0,
  "e2e:__tests__/e2e/command-input-no-input.e2e.test.ts": 69433.0,
  "e2e:__tests__/e2e/lifecycle-exit.e2e.test.ts": 64718.0,
  "e2e:__tests__/e2e/integrate-base-movement.e2e.test.ts": 73120.0
};
