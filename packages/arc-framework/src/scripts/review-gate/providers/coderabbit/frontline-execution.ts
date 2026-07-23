/** Exact-target local CodeRabbit frontline execution adapter. */

import type { ReviewTarget } from "../../core/gate-contract-v2-schema.js";
import type { FrontlineExecutableIdentity } from "../../core/advisory-records.js";
import { normalizeFrontlineOutcome, type FrontlineExecutionOutcome } from "../../policy/frontline-outcome.js";
import type {
  FrontlineSourceDescriptor,
  FrontlineSourceRegistration,
} from "../../policy/frontline-source.js";
import { parseCodeRabbitAgentResult } from "./frontline-agent.js";

export const CODERABBIT_FRONTLINE_REGISTRATION: FrontlineSourceRegistration = {
  sourceId: "coderabbit-cli",
  descriptor: {
    kind: "command",
    executable: "coderabbit",
    argv: ["review", "--agent", "--type", "committed"],
  },
};

interface CodeRabbitProcessResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}

interface ResolvedCodeRabbitExecutable extends FrontlineExecutableIdentity {
  path: string;
}

/**
 * Execute the pinned structured adapter against one exact diff base and normalize its truthful outcome.
 *
 * @param input - Resolved CodeRabbit source, exact target, pass, and immutable checkout.
 * @param dependencies - Executable resolution and direct process ports.
 * @returns The normalized outcome plus the identity of the executable that produced it.
 */
export async function executeCodeRabbitFrontline(input: {
  source: FrontlineSourceDescriptor;
  target: ReviewTarget;
  pass: 1 | 2;
  maxPasses: 1 | 2;
  reviewRoot: string;
}, dependencies: {
  resolveExecutable(command: string): Promise<ResolvedCodeRabbitExecutable>;
  run(
    command: string,
    argv: readonly string[],
    options: { cwd: string },
  ): Promise<CodeRabbitProcessResult>;
}): Promise<{
  outcome: FrontlineExecutionOutcome;
  executableIdentity: FrontlineExecutableIdentity;
}> {
  const expected = CODERABBIT_FRONTLINE_REGISTRATION.descriptor;
  if (input.source.sourceId !== CODERABBIT_FRONTLINE_REGISTRATION.sourceId
    || input.source.kind !== "command"
    || expected.kind !== "command"
    || input.source.executable !== expected.executable
    || input.source.argv.join("\0") !== expected.argv.join("\0")) {
    throw new Error("invalid CodeRabbit frontline source binding");
  }

  const executable = await dependencies.resolveExecutable(input.source.executable);
  let processResult: CodeRabbitProcessResult;
  try {
    processResult = await dependencies.run(executable.path, [
      ...input.source.argv,
      "--base-commit",
      input.target.diffBaseSha,
    ], { cwd: input.reviewRoot });
  } catch {
    processResult = { exitCode: null, signal: "process-error", stdout: "", stderr: "" };
  }
  const cliVersion = executable.qualifiedVersion.includes("/")
    ? executable.qualifiedVersion.slice(executable.qualifiedVersion.lastIndexOf("/") + 1)
    : executable.qualifiedVersion;
  const providerResult = parseCodeRabbitAgentResult({
    cliVersion,
    ...processResult,
    expectedHead: input.target.headSha,
    observedHead: input.target.headSha,
  });
  return {
    outcome: normalizeFrontlineOutcome({
      providerResult,
      source: input.source,
      target: input.target,
      pass: input.pass,
      maxPasses: input.maxPasses,
    }),
    executableIdentity: {
      digest: executable.digest,
      qualifiedVersion: executable.qualifiedVersion,
    },
  };
}
