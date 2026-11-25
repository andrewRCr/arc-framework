/** Shell fragments for a fake CodeRabbit CLI whose completed review covers the range it was asked to review. */

/**
 * POSIX shell lines that print a completed review naming every file the reviewed range changes, as the CLI does.
 *
 * The range runs from the run's `--base-commit` argument to the checkout's `HEAD`; paths must not contain
 * whitespace or double quotes.
 *
 * @param findings - The finding count the completion reports.
 * @returns Lines for a `#!/bin/sh` script, after any finding events it prints.
 */
export function fakeCodeRabbitCompletionLines(findings: number): string[] {
  return [
    "base=''",
    'while [ "$#" -gt 0 ]; do if [ "$1" = "--base-commit" ]; then base="$2"; fi; shift; done',
    "files=''",
    'for file in $(git diff --name-only --no-renames "$base" HEAD); do files="$files${files:+,}\\"$file\\""; done',
    "printf '%s\\n' \"{\\\"type\\\":\\\"complete\\\",\\\"status\\\":\\\"review_completed\\\","
      + `\\"findings\\":${findings},\\"reviewedFiles\\":[$files]}"`,
  ];
}
