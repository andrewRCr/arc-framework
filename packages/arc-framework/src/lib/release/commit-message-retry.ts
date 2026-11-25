/** Latest-retry naming and safe shell rendering for release commits. */

import { replaceCommitMessageSource } from "./commit-message-source.js";

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

/** An option word with nothing for a shell to expand, so it reads unquoted. */
const BARE_OPTION = /^--?[A-Za-z][A-Za-z0-9-]*$/u;

/**
 * Render an `arc release commit` invocation for `args`, quoting every word except a bare option, the `--`
 * terminator, and the `verbatim` words, which a caller supplies as placeholders.
 *
 * @param args - Commit argv to render.
 * @param verbatim - Words to leave exactly as given.
 * @returns A shell-safe release-commit invocation.
 */
export function renderReleaseCommitCommand(args: readonly string[], verbatim: readonly string[] = []): string {
  const words = args.map((arg) => (
    arg === "--" || BARE_OPTION.test(arg) || verbatim.includes(arg) ? arg : quoteShellArgument(arg)
  ));
  return ["arc release commit", ...words].join(" ");
}

/**
 * Render the exact wrapper command for a persisted latest-retry message: the commit's own arguments with only their
 * message source replaced by the retry file, so the retry repeats the same commit.
 *
 * @param path - Absolute wrapper-owned retry path.
 * @param args - The commit's argv; none renders the retry file alone.
 * @param wrapperArgs - Leading wrapper metadata, separate from Git arguments.
 * @returns A shell-safe release-commit invocation.
 */
export function renderCommitMessageRetryCommand(path: string, args: readonly string[] = [], wrapperArgs: readonly string[] = []): string {
  return renderReleaseCommitCommand([...wrapperArgs, ...replaceCommitMessageSource(args, path)]);
}
