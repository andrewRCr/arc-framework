/**
 * The time limit test helpers give one child-process call, such as an `arc` run.
 *
 * A case that makes such calls allows itself this limit once per call plus once for its own setup, so on a slow runner
 * only a call that is itself too slow fails the case, and a hung call still fails at its own limit. Nested test runs
 * take {@link NESTED_CALL_LIMIT} instead, and a case that makes them counts in that limit.
 */
export const CALL_LIMIT = 30_000;

/**
 * How many times longer a nested test run may take on Windows.
 *
 * A nested run starts its own Node, tsx and Vitest processes. On hosted Windows runners, while other heavy test files
 * shared the runner, such runs have taken up to eight times as long as they take there alone, outlasting limits that
 * allowed them five times that.
 */
const WINDOWS_NESTED_RUN_FACTOR = 3;

/**
 * Scale a limit that bounds a nested test run, or a case or setup that makes nested runs, for the platform.
 * @param limit - The limit on Linux and macOS
 * @returns The limit on this platform
 */
export function nestedRunLimit(limit: number): number {
  return process.platform === "win32" ? limit * WINDOWS_NESTED_RUN_FACTOR : limit;
}

/** The time limit for one nested test run: a test controller, a test-cost measurement, or a CI preparation step. */
export const NESTED_CALL_LIMIT = nestedRunLimit(CALL_LIMIT);
