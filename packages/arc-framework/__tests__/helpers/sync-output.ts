/**
 * Test double for {@link SyncOutput} that captures `warn`/`error` diagnostics
 * instead of writing them to `process.stderr`.
 *
 * `handleSync` drives `warn`/`error` through its injected `SyncOutput` on the
 * expected save-failure / push-blocked / identity-absent paths. The real
 * JSON-mode output routes those to `process.stderr`, so a test exercising one
 * of those paths leaks the (intentional) diagnostic into the suite's stderr.
 * Inject this instead: the diagnostics are captured for assertion, and only
 * the SyncOutput channel is silenced — genuinely unexpected `process.stderr`
 * writes from elsewhere still surface.
 *
 * @module
 */

import { prompt } from "../../src/lib/command-input/prompter.js";
import type { SyncOutput } from "../../src/lib/sync-output.js";

export interface CapturingSyncOutput {
  output: SyncOutput;
  /**
   * Captured `warn`/`error` lines, prefixed (`warn: ` / `error: `) to mirror
   * the real JSON-mode `writeStderr` format so assertions match the same text.
   */
  stderr: string[];
}

/**
 * Build a JSON-mode {@link SyncOutput} whose `warn`/`error` calls push to a
 * captured array rather than `process.stderr`. Visual surfaces and info-level
 * logs are no-ops; confirmations retain the real declaration-bound policy.
 */
export function makeCapturingSyncOutput(): CapturingSyncOutput {
  const stderr: string[] = [];
  const output: SyncOutput = {
    jsonMode: true,
    intro: () => undefined,
    outro: () => undefined,
    log: {
      info: () => undefined,
      warn: (message) => {
        stderr.push(`warn: ${message}`);
      },
      error: (message) => {
        stderr.push(`error: ${message}`);
      },
    },
    note: () => undefined,
    spinner: () => ({ start: () => undefined, stop: () => undefined }),
    confirm: prompt,
  };
  return { output, stderr };
}
