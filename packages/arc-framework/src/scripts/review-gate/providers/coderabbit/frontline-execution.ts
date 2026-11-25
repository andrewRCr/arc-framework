/** Exact-target local CodeRabbit frontline execution adapter. */

import type { ReviewTarget } from "../../core/gate-contract-v2-schema.js";
import type { FrontlineExecutableIdentity } from "../../core/advisory-records.js";
import type { ReviewPass } from "../../core/review-pass.js";
import { normalizeFrontlineOutcome, type FrontlineExecutionOutcome } from "../../policy/frontline-outcome.js";
import type {
  FrontlineSourceDescriptor,
  FrontlineSourceRegistration,
} from "../../policy/frontline-source.js";
import { parseCodeRabbitAgentResult, type CodeRabbitChangedFile } from "./frontline-agent.js";
import {
  CodeRabbitExecutableUnavailableError,
} from "./executable.js";
import { codeRabbitProcessDiagnostic, type CodeRabbitProcessResult } from "./process.js";

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

/** The exact-target inputs that list the changed files a run has to cover. */
interface ChangedFileListingInput {
  reviewRoot: string;
  diffBaseSha: string;
  headSha: string;
  signal: AbortSignal;
}

/** The listed changed files, or the provider result that ends a run whose files could not be listed. */
type ChangedFileListing =
  | { files: readonly CodeRabbitChangedFile[] }
  | { failure: { kind: "timed-out" } | { kind: "failed"; reason: string } };

/**
 * List the target's changed files before the provider runs, so a run whose coverage cannot be checked never starts.
 */
async function listChangedFilesBeforeRun(
  input: { reviewRoot: string; target: ReviewTarget; signal: AbortSignal },
  listChangedFiles: (input: ChangedFileListingInput) => Promise<readonly CodeRabbitChangedFile[]>,
): Promise<ChangedFileListing> {
  try {
    return {
      files: await awaitWithSignal(listChangedFiles({
        reviewRoot: input.reviewRoot,
        diffBaseSha: input.target.diffBaseSha,
        headSha: input.target.headSha,
        signal: input.signal,
      }), input.signal),
    };
  } catch (error) {
    return {
      failure: input.signal.aborted
        ? { kind: "timed-out" }
        : { kind: "failed", reason: codeRabbitProcessDiagnostic(error, "changed-file listing") },
    };
  }
}

/**
 * Execute the structurally qualified adapter against one exact diff base and normalize its truthful outcome.
 *
 * @param input - Resolved CodeRabbit source, exact target, pass, and immutable checkout.
 * @param dependencies - Executable resolution, the target's changed-file listing, and direct process ports.
 * @returns The normalized outcome plus the identity of the executable that produced it.
 */
export async function executeCodeRabbitFrontline(input: {
  source: FrontlineSourceDescriptor;
  target: ReviewTarget;
  pass: ReviewPass;
  maxPasses: ReviewPass;
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
  listChangedFiles(input: ChangedFileListingInput): Promise<readonly CodeRabbitChangedFile[]>;
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
          reason: codeRabbitProcessDiagnostic(error, "executable resolution"),
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
  const changed = await listChangedFilesBeforeRun(input, listing => dependencies.listChangedFiles(listing));
  if ("failure" in changed) {
    return {
      outcome: normalizeFrontlineOutcome({
        providerResult: changed.failure,
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
    return {
      outcome: normalizeFrontlineOutcome({
        providerResult: { kind: "failed", reason: codeRabbitProcessDiagnostic(error) },
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
      changedFiles: changed.files,
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
