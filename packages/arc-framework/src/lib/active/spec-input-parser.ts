/**
 * Cold-start seed classification. Issue references set Origin; documents and
 * descriptions pass through for the agent to read during planning. Empty input
 * is the only parse failure; successful variants cross a strict runtime schema.
 * @module
 */

import { z } from "zod";

/** A seed classification and its sole closed field assignment, Origin. */
export const ParsedSpecInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("issue"), origin: z.string().min(1) }),
  z.strictObject({ kind: z.literal("document"), document: z.string().min(1) }),
  z.strictObject({ kind: z.literal("description"), description: z.string().min(1) }),
]);

export type ParsedSpecInput = z.infer<typeof ParsedSpecInputSchema>;

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
/** A single token with no whitespace — a pointer is one of these plus a separator or extension. */
const SINGLE_TOKEN = /^\S+$/;
const HAS_EXTENSION = /\.[A-Za-z0-9]{1,8}$/;

function success(value: ParsedSpecInput): SpecInputParse {
  return { ok: true, value: ParsedSpecInputSchema.parse(value) };
}

/**
 * Classify a raw spec input into its variant and any meta field it sets.
 *
 * Checked in precedence order so the specific wins over the general: issue
 * references first (an issue URL is also a pointer; `owner/repo#n` also holds a
 * separator), then pointer-shaped documents, then free
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
    return success({ kind: "issue", origin: input });
  }

  // Pointer-shaped tokens: a separator or a file extension and no whitespace.
  if (SINGLE_TOKEN.test(input) && (input.includes("/") || HAS_EXTENSION.test(input))) {
    return success({ kind: "document", document: input });
  }

  // Free text — a name + brief description for the agent to work from.
  return success({ kind: "description", description: input });
}
