/** Raw completed push evidence shared by the manual host probes. Callers decide what it proves. */
import assert from "node:assert/strict";
import { isCompletedGitFailure, isGitProcessError } from "../../src/lib/git/process-error.js";
import { parsePushPorcelain, type PushOutcome } from "../../src/lib/git/push.js";

export interface HostPushFailure {
  exitCode: number;
  stdout: string;
  stderr: string;
  outcome: PushOutcome;
}

/** Refuse signals, incomplete execution and untyped setup failures before interpreting diagnostics. */
export function hostPushFailure(error: unknown): HostPushFailure {
  assert(isGitProcessError(error) && isCompletedGitFailure(error), "Expected a completed unsignaled failed Git push");
  const exitCode = error.exitCode!;
  return { exitCode, stdout: error.stdout, stderr: error.stderr,
    outcome: parsePushPorcelain(error.stdout, error.stderr, exitCode) };
}
