/** Direct CodeRabbit process execution with abort-driven termination. */

import { execa } from "execa";

import type { InteractionContext } from "../../../../lib/command-input/interaction-context.js";
import { MAX_GIT_OUTPUT_BYTES } from "../../../../lib/git/process-executor.js";

export interface CodeRabbitProcessResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  canceled: boolean;
}

/** Run one exact executable path without a shell and terminate it when the caller aborts. */
export async function runCodeRabbitProcess(
  command: string,
  argv: readonly string[],
  options: {
    cwd: string;
    remainingMs: number;
    signal: AbortSignal;
    interaction?: InteractionContext["subprocess"];
  },
): Promise<CodeRabbitProcessResult> {
  const result = await execa(command, argv, {
    cwd: options.cwd,
    reject: false,
    stripFinalNewline: false,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    cancelSignal: options.signal,
    forceKillAfterDelay: 1_000,
    ...(options.interaction?.ambientStdin === "closed" ? { stdin: "ignore" as const } : {}),
  });
  return {
    exitCode: result.exitCode ?? null,
    signal: result.signal ?? null,
    stdout: result.stdout,
    stderr: result.stderr,
    canceled: result.isCanceled,
  };
}
