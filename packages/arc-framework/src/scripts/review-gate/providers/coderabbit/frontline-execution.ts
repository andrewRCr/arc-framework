/** Exact-target local CodeRabbit frontline execution adapter. */

import type { ReviewTarget } from "../../core/gate-contract-v2-schema.js";
import { normalizeFrontlineOutcome, type FrontlineExecutionOutcome } from "../../policy/frontline-outcome.js";
import type {
  FrontlineSourceDescriptor,
  FrontlineSourceRegistration,
} from "../../policy/frontline-source.js";
import { parseCodeRabbitPlainResult } from "./frontline-plain.js";

export const CODERABBIT_FRONTLINE_REGISTRATION: FrontlineSourceRegistration = {
  sourceId: "coderabbit-cli",
  descriptor: {
    kind: "command",
    executable: "coderabbit",
    argv: ["review", "--plain", "--type", "committed"],
  },
};

interface CodeRabbitProcessResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}

/**
 * Execute the pinned plain adapter against one exact diff base and normalize its truthful outcome.
 *
 * @param input - Resolved CodeRabbit source, exact target, pass, and observed CLI version.
 * @param dependencies - Direct process and current-HEAD ports.
 * @returns A provider-neutral exact-target frontline outcome.
 */
export async function executeCodeRabbitFrontline(input: {
  source: FrontlineSourceDescriptor;
  target: ReviewTarget;
  pass: 1 | 2;
  maxPasses: 1 | 2;
  cliVersion: string;
}, dependencies: {
  run(command: string, argv: readonly string[]): Promise<CodeRabbitProcessResult>;
  readHead(): Promise<string>;
}): Promise<FrontlineExecutionOutcome> {
  const expected = CODERABBIT_FRONTLINE_REGISTRATION.descriptor;
  if (input.source.sourceId !== CODERABBIT_FRONTLINE_REGISTRATION.sourceId
    || input.source.kind !== "command"
    || expected.kind !== "command"
    || input.source.executable !== expected.executable
    || input.source.argv.join("\0") !== expected.argv.join("\0")) {
    throw new Error("invalid CodeRabbit frontline source binding");
  }

  const before = await dependencies.readHead();
  let processResult: CodeRabbitProcessResult;
  try {
    processResult = await dependencies.run(input.source.executable, [
      ...input.source.argv,
      "--base-commit",
      input.target.diffBaseSha,
    ]);
  } catch {
    processResult = { exitCode: null, signal: "process-error", stdout: "", stderr: "" };
  }
  const after = await dependencies.readHead();
  const providerResult = parseCodeRabbitPlainResult({
    cliVersion: input.cliVersion,
    ...processResult,
    expectedHead: input.target.headSha,
    observedHead: before === input.target.headSha ? after : before,
  });
  return normalizeFrontlineOutcome({
    providerResult,
    source: input.source,
    target: input.target,
    pass: input.pass,
    maxPasses: input.maxPasses,
  });
}
