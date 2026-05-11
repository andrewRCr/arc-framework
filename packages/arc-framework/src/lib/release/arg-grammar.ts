/**
 * Argv normalizer for `arc release push`.
 *
 * The push wrapper always supplies `origin <current-branch>` to the wrapped
 * `git push`. Workflow prose, however, naturally expresses push targets as
 * raw-git positional fragments (`origin <branch>`, `-u origin <branch>`).
 * Copy-pasting those literally into a wrapper invocation expands into a
 * malformed spawn (`git push origin <branch> origin <branch>`). This module
 * detects and reconciles the positional pair: matching pairs are stripped,
 * mismatched pairs refuse with code 15 carrying the attempted/expected
 * ref detail.
 *
 * Recognized positional forms:
 * - `<remote> <branch>` — two consecutive non-flag tokens
 * - `-u <remote> <branch>` / `--set-upstream <remote> <branch>` — the flag
 *   is preserved; only the positional pair is stripped
 *
 * Value-taking flags (`-o` / `--push-option`) consume the following token as
 * their value, preventing it from being misread as the start of a positional
 * pair. Single positional tokens (no following non-flag) pass through unchanged;
 * other flags and flag-with-`=value` forms also pass through. Arg-grammar
 * issues outside this narrow scope continue to fall through to git's own
 * parser.
 *
 * @module
 */

/** Result of normalizing a release-push argv against the wrapper's target. */
export type NormalizeReleasePushArgsResult =
  | { kind: "ok"; args: string[] }
  | {
      kind: "mismatch";
      attempted: { remote: string; branch: string };
      expected: { remote: string; branch: string };
    };

const SET_UPSTREAM_FLAGS: ReadonlySet<string> = new Set(["-u", "--set-upstream"]);
const VALUE_TAKING_FLAGS: ReadonlySet<string> = new Set(["-o", "--push-option"]);
const EXPECTED_REMOTE = "origin";

/**
 * Normalize positional `<remote> <branch>` arguments against the wrapper's
 * fixed push target. Returns `{ kind: "ok", args }` with positional pairs
 * stripped (flags preserved) on a match; `{ kind: "mismatch", … }` on the
 * first detected divergence.
 *
 * Tokens beginning with `-` are treated as flags and passed through. The
 * `-u` / `--set-upstream` flags consume the next two positional tokens
 * when both are present as non-flags; the flag itself is preserved in the
 * normalized output. A leading flag with no following positional pair is
 * left intact.
 */
export function normalizeReleasePushArgs(
  argv: readonly string[],
  currentBranch: string,
): NormalizeReleasePushArgsResult {
  const out: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === undefined) break;

    if (VALUE_TAKING_FLAGS.has(arg)) {
      out.push(arg);
      const value = argv[i + 1];
      if (value !== undefined) {
        out.push(value);
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (SET_UPSTREAM_FLAGS.has(arg)) {
      const pair = readPositionalPair(argv, i + 1);
      if (pair !== null) {
        const mismatch = checkPair(pair, currentBranch);
        if (mismatch !== null) return mismatch;
        out.push(arg);
        i += 3;
        continue;
      }
      out.push(arg);
      i += 1;
      continue;
    }

    if (!arg.startsWith("-")) {
      const pair = readPositionalPair(argv, i);
      if (pair !== null) {
        const mismatch = checkPair(pair, currentBranch);
        if (mismatch !== null) return mismatch;
        i += 2;
        continue;
      }
      out.push(arg);
      i += 1;
      continue;
    }

    out.push(arg);
    i += 1;
  }
  return { kind: "ok", args: out };
}

/**
 * Read two consecutive non-flag tokens starting at `start`. Returns the
 * pair when both are present and neither begins with `-`; null otherwise.
 */
function readPositionalPair(
  argv: readonly string[],
  start: number,
): { remote: string; branch: string } | null {
  const a = argv[start];
  const b = argv[start + 1];
  if (a === undefined || b === undefined) return null;
  if (a.startsWith("-") || b.startsWith("-")) return null;
  return { remote: a, branch: b };
}

/**
 * Compare a detected positional pair against the wrapper's fixed target
 * (`origin <currentBranch>`). Returns a `mismatch` result on divergence;
 * null when the pair matches and can be stripped silently.
 */
function checkPair(
  pair: { remote: string; branch: string },
  currentBranch: string,
): Extract<NormalizeReleasePushArgsResult, { kind: "mismatch" }> | null {
  if (pair.remote === EXPECTED_REMOTE && pair.branch === currentBranch) {
    return null;
  }
  return {
    kind: "mismatch",
    attempted: { remote: pair.remote, branch: pair.branch },
    expected: { remote: EXPECTED_REMOTE, branch: currentBranch },
  };
}
