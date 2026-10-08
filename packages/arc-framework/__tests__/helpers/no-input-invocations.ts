/** Distinct unavailable-interaction invocations over the actual CLI transport. */
import type { NoInputMatrixCase } from "../fixtures/command-input/no-input-matrix.js";
import { usesPseudoTty } from "./cli-transport.js";

/** One original signal variant with its exact argv and transport request. */
export interface NoInputInvocation {
  readonly signal: "--no-input" | "CI" | "non-TTY";
  readonly args: string[];
  readonly ci: "false" | "true";
  readonly forceNoTty: boolean;
}

/**
 * Select one pipe representative and every distinct pseudo-terminal signal.
 * @param entry - Command coverage case with its stdin and argv
 * @param platform - Host platform used by the CLI helper
 * @returns Invocations preserving each distinct unavailable-interaction context
 */
export function selectNoInputInvocations(entry: NoInputMatrixCase, platform: NodeJS.Platform = process.platform): NoInputInvocation[] {
  const candidates: NoInputInvocation[] = [
    { signal: "--no-input", args: ["--no-input", ...entry.args], ci: "false", forceNoTty: false },
    { signal: "CI", args: [...entry.args], ci: "true", forceNoTty: false },
    { signal: "non-TTY", args: [...entry.args], ci: "false", forceNoTty: true },
  ];
  let pipeSelected = false;
  return candidates.filter(({ args, forceNoTty }) => {
    if (entry.stdin === undefined && !forceNoTty && usesPseudoTty(args, platform)) return true;
    if (pipeSelected) return false;
    pipeSelected = true;
    return true;
  });
}
