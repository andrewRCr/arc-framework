/** Orchestration for standalone commit-message validation. */

import { validateCommitMessage } from "../../lib/commit-check/validate.js";
import type { CommitMessageCheckRepository } from "../../lib/commit-check/repository.js";
import type {
  CommitCheckOutcome,
} from "../../lib/commit-check/types.js";

/** Injected byte and repository boundaries for the check handler. */
export interface CheckCommitMessageDeps {
  readFile: (path: string) => Promise<Uint8Array>;
  readStdin: () => Promise<Uint8Array>;
  setupRepository: () => Promise<CommitMessageCheckRepository>;
}

/** Stable error identifiers for usage and infrastructure failures. */
export type CommitMessageCheckErrorCode =
  | "input.required"
  | "input.unreadable"
  | "repository.setup-failed"
  | "encoding.unsupported"
  | "encoding.malformed";

/** Typed failure returned before grammar validation can complete. */
export interface CommitMessageCheckError {
  kind: "usage" | "infrastructure";
  code: CommitMessageCheckErrorCode;
  message: string;
}

/** Successful orchestration, including bytes retained outside the grammar layer. */
export interface CommitMessageCheckResult {
  kind: "result";
  exitCode: 0 | 1;
  sourceBytes: Uint8Array;
  result: CommitCheckOutcome;
}

/** Usage or infrastructure failure. */
export interface CommitMessageCheckFailure {
  kind: "error";
  exitCode: 2;
  error: CommitMessageCheckError;
}

/** Complete standalone check result with stable process semantics. */
export type RunCheckCommitMessageResult = CommitMessageCheckResult | CommitMessageCheckFailure;

function error(
  kind: CommitMessageCheckError["kind"],
  code: CommitMessageCheckErrorCode,
  message: string,
): CommitMessageCheckFailure {
  return { kind: "error", exitCode: 2, error: { kind, code, message } };
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Read, decode, and validate one commit-message source.
 *
 * @param source - File path, or `-` for stdin
 * @param deps - Injected byte readers and repository setup
 * @returns Typed validation result or pre-validation failure
 */
export async function runCheckCommitMessage(
  source: string | undefined,
  deps: CheckCommitMessageDeps,
): Promise<RunCheckCommitMessageResult> {
  if (source === undefined || source === "") {
    return error("usage", "input.required", "Provide a commit-message file path, or - for stdin.");
  }

  let repository: CommitMessageCheckRepository;
  try {
    repository = await deps.setupRepository();
  } catch (cause: unknown) {
    return error(
      "infrastructure",
      "repository.setup-failed",
      `Could not prepare commit-message validation: ${errorMessage(cause)}`,
    );
  }

  let sourceBytes: Uint8Array;
  try {
    sourceBytes = source === "-" ? await deps.readStdin() : await deps.readFile(source);
  } catch (cause: unknown) {
    return error(
      "infrastructure",
      "input.unreadable",
      `Could not read commit-message input ${source === "-" ? "from stdin" : source}: ${errorMessage(cause)}`,
    );
  }

  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(repository.encoding, { fatal: true });
  } catch {
    return error(
      "infrastructure",
      "encoding.unsupported",
      `Git i18n.commitEncoding names unsupported encoding: ${repository.encoding}`,
    );
  }

  let message: string;
  try {
    message = decoder.decode(sourceBytes);
  } catch {
    return error(
      "infrastructure",
      "encoding.malformed",
      `Commit-message input is not valid ${decoder.encoding}.`,
    );
  }

  const result = await validateCommitMessage(message, repository.context);
  const exitCode = result.kind === "validated" && result.verdict === "fail" ? 1 : 0;
  return { kind: "result", exitCode, sourceBytes, result };
}
