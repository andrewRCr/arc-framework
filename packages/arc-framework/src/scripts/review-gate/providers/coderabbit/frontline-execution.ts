/** Exact-target local CodeRabbit frontline execution adapter. */

import type { ReviewTarget } from "../../core/gate-contract-v2-schema.js";
import type { FrontlineExecutableIdentity } from "../../core/advisory-records.js";
import { normalizeFrontlineOutcome, type FrontlineExecutionOutcome } from "../../policy/frontline-outcome.js";
import type {
  FrontlineSourceDescriptor,
  FrontlineSourceRegistration,
} from "../../policy/frontline-source.js";
import { parseCodeRabbitAgentResult } from "./frontline-agent.js";
import {
  CodeRabbitExecutableUnavailableError,
} from "./executable.js";
import type { CodeRabbitProcessResult } from "./process.js";

export const CODERABBIT_FRONTLINE_REGISTRATION: FrontlineSourceRegistration = {
  sourceId: "coderabbit-cli",
  descriptor: {
    kind: "command",
    executable: "coderabbit",
    argv: ["review", "--agent", "--type", "committed"],
  },
};

interface ResolvedCodeRabbitExecutable extends FrontlineExecutableIdentity {
  path: string;
}

function systemErrorCode(error: unknown): string | null {
  if (!(error instanceof Error) || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function awaitWithSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const aborted = () => {
      reject(signal.reason instanceof Error ? signal.reason : new Error("frontline execution aborted"));
    };
    if (signal.aborted) {
      aborted();
      return;
    }
    signal.addEventListener("abort", aborted, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", aborted);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", aborted);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
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
  remainingMs: number;
  signal: AbortSignal;
}, dependencies: {
  resolveExecutable(
    command: string,
    context: { remainingMs: number; signal: AbortSignal },
  ): Promise<ResolvedCodeRabbitExecutable>;
  run(
    command: string,
    argv: readonly string[],
    options: { cwd: string; remainingMs: number; signal: AbortSignal },
  ): Promise<CodeRabbitProcessResult>;
}): Promise<{
  outcome: FrontlineExecutionOutcome;
  executableIdentity: FrontlineExecutableIdentity | null;
}> {
  const deadlineAt = Date.now() + input.remainingMs;
  const remainingMs = () => Math.max(1, deadlineAt - Date.now());
  const expected = CODERABBIT_FRONTLINE_REGISTRATION.descriptor;
  if (input.source.sourceId !== CODERABBIT_FRONTLINE_REGISTRATION.sourceId
    || input.source.kind !== "command"
    || expected.kind !== "command"
    || input.source.executable !== expected.executable
    || input.source.argv.join("\0") !== expected.argv.join("\0")) {
    return {
      outcome: normalizeFrontlineOutcome({
        providerResult: { kind: "source-unbound" },
        source: input.source,
        target: input.target,
        pass: input.pass,
        maxPasses: input.maxPasses,
      }),
      executableIdentity: null,
    };
  }

  let executable: ResolvedCodeRabbitExecutable;
  try {
    executable = await awaitWithSignal(
      dependencies.resolveExecutable(input.source.executable, {
        remainingMs: remainingMs(),
        signal: input.signal,
      }),
      input.signal,
    );
  } catch (error) {
    if (input.signal.aborted) {
      return {
        outcome: normalizeFrontlineOutcome({
          providerResult: { kind: "timed-out" },
          source: input.source,
          target: input.target,
          pass: input.pass,
          maxPasses: input.maxPasses,
        }),
        executableIdentity: null,
      };
    }
    const providerResult = error instanceof CodeRabbitExecutableUnavailableError
      ? { kind: "capability-unsupported" as const }
      : {
          kind: "failed" as const,
          reason: error instanceof Error ? error.message : String(error),
        };
    return {
      outcome: normalizeFrontlineOutcome({
        providerResult,
        source: input.source,
        target: input.target,
        pass: input.pass,
        maxPasses: input.maxPasses,
      }),
      executableIdentity: null,
    };
  }
  let processResult: CodeRabbitProcessResult;
  try {
    processResult = await awaitWithSignal(
      dependencies.run(executable.path, [
        ...input.source.argv,
        "--base-commit",
        input.target.diffBaseSha,
      ], {
        cwd: input.reviewRoot,
        remainingMs: remainingMs(),
        signal: input.signal,
      }),
      input.signal,
    );
  } catch (error) {
    if (input.signal.aborted) {
      return {
        outcome: normalizeFrontlineOutcome({
          providerResult: { kind: "timed-out" },
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
    if (["EACCES", "EPERM"].includes(systemErrorCode(error) ?? "")) {
      return {
        outcome: normalizeFrontlineOutcome({
          providerResult: { kind: "authorization-rejected" },
          source: input.source,
          target: input.target,
          pass: input.pass,
          maxPasses: input.maxPasses,
        }),
        executableIdentity: null,
      };
    }
    processResult = {
      exitCode: null,
      signal: "process-error",
      stdout: "",
      stderr: "",
      canceled: input.signal.aborted,
    };
  }
  const cliVersion = executable.qualifiedVersion.includes("/")
    ? executable.qualifiedVersion.slice(executable.qualifiedVersion.lastIndexOf("/") + 1)
    : executable.qualifiedVersion;
  const providerResult = input.signal.aborted
    ? { kind: "timed-out" as const }
    : parseCodeRabbitAgentResult({
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
