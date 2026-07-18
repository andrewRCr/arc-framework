/**
 * Deterministic literal and regular-expression matching with source evidence.
 *
 * @module
 */

import { CouplingAuditScanError } from "./contracts.js";
import type { AuditPattern } from "./types.js";

/** One pattern match with zero-based offsets and one-based human locations. */
export interface PatternMatch {
  patternId: string;
  start: number;
  end: number;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  token: string;
  excerpt: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compile(pattern: AuditPattern): RegExp {
  const source = pattern.form === "literal" ? escapeRegex(pattern.value) : pattern.value;
  const declaredFlags = pattern.form === "literal" ? (pattern.caseSensitive === false ? "iu" : "u") : pattern.flags ?? "u";
  const flags = [...new Set(`${declaredFlags.replace(/[gyd]/g, "")}g`)].join("");
  let regex: RegExp;
  try {
    regex = new RegExp(source, flags);
  } catch (error) {
    throw new CouplingAuditScanError(
      `Pattern ${pattern.id} has invalid runtime regex state: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  regex.lastIndex = 0;
  if (regex.test("")) throw new CouplingAuditScanError(`Pattern ${pattern.id} must not match the empty string`);
  regex.lastIndex = 0;
  return regex;
}

function location(content: string, start: number, end: number): Omit<PatternMatch, "patternId" | "start" | "end" | "token"> {
  const lineStart = content.lastIndexOf("\n", start - 1) + 1;
  const line = content.slice(0, lineStart).split("\n").length;
  const column = Array.from(content.slice(lineStart, start)).length + 1;
  const endLineStart = content.lastIndexOf("\n", Math.max(start, end - 1)) + 1;
  const endLine = content.slice(0, endLineStart).split("\n").length;
  const endColumn = Array.from(content.slice(endLineStart, end)).length + 1;
  const excerptEnd = content.indexOf("\n", start);
  const rawExcerpt = content.slice(lineStart, excerptEnd === -1 ? content.length : excerptEnd);
  return { line, column, endLine, endColumn, excerpt: rawExcerpt.slice(0, 240) };
}

/**
 * Find every non-overlapping occurrence of one pattern. Global iteration is
 * engine-owned regardless of declared regex flags.
 *
 * @param content - Decoded UTF-8 file content.
 * @param pattern - Validated manifest pattern.
 * @returns Stable matches in source order.
 */
export function findPatternMatches(content: string, pattern: AuditPattern): PatternMatch[] {
  const regex = compile(pattern);
  const matches: PatternMatch[] = [];
  for (const match of content.matchAll(regex)) {
    const token = match[0];
    const start = match.index;
    const end = start + token.length;
    matches.push({ patternId: pattern.id, start, end, token, ...location(content, start, end) });
  }
  return matches;
}

/**
 * Find all evidence from a pattern set without suppressing cross-pattern overlap.
 *
 * @param content - Decoded UTF-8 file content.
 * @param patterns - Manifest pattern set.
 * @returns Matches ordered by span then pattern ID.
 */
export function findPatternSetMatches(content: string, patterns: readonly AuditPattern[]): PatternMatch[] {
  return patterns
    .flatMap((pattern) => findPatternMatches(content, pattern))
    .sort((left, right) =>
      left.start - right.start || left.end - right.end || (left.patternId < right.patternId ? -1 : 1),
    );
}
