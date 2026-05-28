/**
 * Cold-start spec-input parser.
 *
 * A cold-start scaffolds a meta into an existing worktree from whatever the
 * operator points at. This classifies that raw input, making only two *closed*
 * meta-field assignments and passing everything else through for the agent to
 * read and assess interactively:
 *
 * - an ARC spec artifact (`draft-*` / `spec-*`) → the meta `Design` field;
 * - an issue reference (`#42`, `owner/repo#42`, an `…/issues/…` URL) → the meta
 *   `Origin` field — the one unambiguous trigger shape.
 *
 * Anything else is pass-through and touches no meta field: a `document` (a file
 * path or URL the agent should read — including a prefixless `whatever.md` or a
 * non-spec ARC artifact like `tasks-*`) or a free-text `description`. The
 * trigger-vs-spec distinction for those is the operator's intent, which the
 * `arc-session` skill resolves — not something to guess from syntax. `Origin`
 * and `Design` stay closed and narrow by design.
 *
 * Outcomes are discriminated and no-throw (the `lib/user-sync/parser.ts` house
 * pattern); only empty input fails. The variant union is shaped so a later zod
 * discriminated union can wrap it without restructuring.
 *
 * @module
 */

/**
 * A classified spec input. The two closed kinds each carry exactly one meta
 * field; the two pass-through kinds carry the raw input for the agent and set
 * no field. The `kind` discriminant makes that narrowness type-level.
 */
export type ParsedSpecInput =
  /** ARC spec artifact (`draft-*` / `spec-*`) → meta `Design`. */
  | { kind: "arc-spec"; design: string }
  /** Issue reference (`#42` / `owner/repo#42` / `…/issues/…` URL) → meta `Origin`. */
  | { kind: "issue"; origin: string }
  /** A file path or URL for the agent to read and assess — no meta field. */
  | { kind: "document"; document: string }
  /** A free-text work-unit description — no meta field. */
  | { kind: "description"; description: string };

/**
 * No-throw, discriminated parse outcome. A `false` outcome carries a
 * human-readable `reason` instead of throwing.
 */
export type SpecInputParse =
  | { ok: true; value: ParsedSpecInput }
  | { ok: false; reason: string };

/** Bare `#42`, or `owner/repo#42` — issue-tracker shorthand. */
const ISSUE_SHORTHAND = /^(#\d+|[\w.-]+\/[\w.-]+#\d+)$/;
/** An http(s) URL — used only to scope the `/issues/` issue-URL check. */
const HTTP_URL = /^https?:\/\//i;
/** ARC spec artifacts, matched on basename: `draft-…md` / `spec-…md`. */
const ARC_SPEC = /^(draft|spec)-.+\.md$/;
/** A single token with no whitespace — a pointer is one of these plus a separator or extension. */
const SINGLE_TOKEN = /^\S+$/;
const HAS_EXTENSION = /\.[A-Za-z0-9]{1,8}$/;

/**
 * Classify a raw spec input into its variant and any meta field it sets.
 *
 * Checked in precedence order so the specific wins over the general: issue
 * references first (an issue URL is also a pointer; `owner/repo#n` also holds a
 * separator), then ARC spec artifacts, then pointer-shaped documents, then free
 * text. Only empty input fails — a malformed pointer is still a `document` the
 * agent reads and reports on.
 *
 * @param raw - The operator's spec input.
 * @returns A success outcome carrying the classified variant, or a failure
 *   outcome when the input is empty.
 */
export function parseSpecInput(raw: string): SpecInputParse {
  const input = raw.trim();
  if (input === "") {
    return { ok: false, reason: "spec input is empty" };
  }

  // Issue references — shorthand, or an http URL whose path names an issue.
  // Must precede the pointer checks (an issue URL is pointer-shaped).
  if (ISSUE_SHORTHAND.test(input) || (HTTP_URL.test(input) && input.includes("/issues/"))) {
    return { ok: true, value: { kind: "issue", origin: input } };
  }

  // Pointer-shaped tokens: a separator or a file extension and no whitespace.
  if (SINGLE_TOKEN.test(input) && (input.includes("/") || HAS_EXTENSION.test(input))) {
    const basename = input.split("/").pop() ?? input;
    if (ARC_SPEC.test(basename)) {
      return { ok: true, value: { kind: "arc-spec", design: input } };
    }
    // Any other pointer (a non-ARC file, a non-issue URL, a non-spec ARC
    // artifact) is the agent's to read — not a guessed Origin/Design.
    return { ok: true, value: { kind: "document", document: input } };
  }

  // Free text — a name + brief description for the agent to work from.
  return { ok: true, value: { kind: "description", description: input } };
}
