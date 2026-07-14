/** Public surface for the `arc check` command namespace. */

export { handleCheckCommitMessage } from "../handlers/check/commit-msg-cli.js";
export type { HandleCheckCommitMessageOptions } from "../handlers/check/commit-msg-cli.js";
export { runCheckCommitMessage } from "../handlers/check/commit-msg.js";
export type {
  CheckCommitMessageDeps,
  CommitMessageCheckError,
  CommitMessageCheckErrorCode,
  CommitMessageCheckFailure,
  CommitMessageCheckResult,
  RunCheckCommitMessageResult,
} from "../handlers/check/commit-msg.js";
