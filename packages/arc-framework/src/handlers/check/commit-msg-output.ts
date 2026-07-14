/** Stable human and JSON rendering for standalone commit-message checks. */

import { formatCommitCheckOutcome } from "../../lib/commit-check/diagnostics.js";
import type { CommitCheckOutcome } from "../../lib/commit-check/types.js";
import type {
  CommitMessageCheckError,
  RunCheckCommitMessageResult,
} from "./commit-msg.js";

/** Schema version for the public standalone check envelope. */
export const CHECK_COMMIT_MESSAGE_SCHEMA_VERSION = 1 as const;

/** Successful or skipped validation envelope. */
export interface CheckCommitMessageResultEnvelope {
  schemaVersion: typeof CHECK_COMMIT_MESSAGE_SCHEMA_VERSION;
  result: CommitCheckOutcome;
}

/** Usage or infrastructure failure envelope. */
export interface CheckCommitMessageErrorEnvelope {
  schemaVersion: typeof CHECK_COMMIT_MESSAGE_SCHEMA_VERSION;
  error: CommitMessageCheckError;
}

/** Exactly one output stream populated for one command return path. */
export interface RenderedCheckCommitMessage {
  stdout?: string;
  stderr?: string;
}

/**
 * Render a standalone check result without process side effects.
 *
 * @param outcome - Typed orchestration result
 * @param json - Whether to emit the versioned machine envelope
 * @returns One stdout or stderr payload, including its terminal newline
 */
export function renderCheckCommitMessage(
  outcome: RunCheckCommitMessageResult,
  json: boolean,
): RenderedCheckCommitMessage {
  if (json) {
    const envelope: CheckCommitMessageResultEnvelope | CheckCommitMessageErrorEnvelope =
      outcome.kind === "result"
        ? { schemaVersion: CHECK_COMMIT_MESSAGE_SCHEMA_VERSION, result: outcome.result }
        : { schemaVersion: CHECK_COMMIT_MESSAGE_SCHEMA_VERSION, error: outcome.error };
    return { stdout: `${JSON.stringify(envelope)}\n` };
  }

  if (outcome.kind === "result") {
    return { stdout: `${formatCommitCheckOutcome(outcome.result)}\n` };
  }
  return { stderr: `error: ${outcome.error.message}\n` };
}
