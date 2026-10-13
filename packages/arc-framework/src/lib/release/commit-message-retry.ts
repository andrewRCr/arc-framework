/** Latest-retry naming and safe shell rendering for release commits. */

/** Wrapper-owned filename beneath the active worktree's absolute Git directory. */
export const COMMIT_MESSAGE_RETRY_FILENAME = ".arc-release-commit-message-retry";

/**
 * Quote one argument for literal reuse by a POSIX-compatible host shell.
 *
 * @param value - Literal argument value.
 * @returns A single shell word with expansion and command substitution disabled.
 */
export function quoteShellArgument(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

/**
 * Render the exact wrapper command for a persisted latest-retry message.
 *
 * @param path - Absolute wrapper-owned retry path.
 * @param options - `amend` keeps the retry an amend rather than a new commit.
 * @returns A shell-safe release-commit invocation.
 */
export function renderCommitMessageRetryCommand(path: string, options: { amend?: boolean } = {}): string {
  return `arc release commit ${options.amend === true ? "--amend " : ""}-F ${quoteShellArgument(path)}`;
}
