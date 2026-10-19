/**
 * Work-unit target reads over `USER-INBOX` captures.
 *
 * A capture names the work unit it is addressed to on a top-level `WU_Target`
 * bullet, written in any of three forms: `` - `WU_Target: <slug>` ``,
 * `` - _WU_Target:_ `<slug>` ``, or a bare `- WU_Target: <slug>`. A
 * `(planned)` or `(provisional)` commitment hint may follow the slug. A mention
 * inside prose or a nested bullet is not a target line, and an undecided `TBD`
 * names no work unit.
 *
 * @module
 */

import { managedFlagIsTrue } from "../session-init/managed-field.js";
import { parsePersonalInboxEntries, stripHtmlComments } from "../store/kinds/personal-inbox.js";
import { targetNamedByLine } from "../store/kinds/entry-fields.js";
import type { CrossWuEntry } from "./schema.js";

/** One capture whose target line names the requested work unit. */
export interface InboxTargetEntry {
  readonly title: string;
  readonly section: Exclude<CrossWuEntry["section"], "Memories">;
  /** Whether the capture carries `` _Hold:_ `true` ``. */
  readonly held: boolean;
}

/** Selected captures in file order, plus every entry block or target line that could not be read. */
export interface InboxTargetListing {
  readonly entries: readonly InboxTargetEntry[];
  readonly diagnostics: readonly string[];
}

/** The top-level target lines in a block of inbox text that name `target`. */
function linesNamingTarget(text: string, target: string): string[] {
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trimEnd();
    if (targetNamedByLine(trimmed) === target) lines.push(trimmed);
  }
  return lines;
}

/**
 * Target lines naming `target` that no readable entry accounts for: lines in an
 * unreadable entry, or outside the sections the entry parser reads.
 */
function strayTargetLines(content: string, target: string, readLines: readonly string[]): string[] {
  const unread = new Map<string, number>();
  for (const line of readLines) unread.set(line, (unread.get(line) ?? 0) + 1);
  const stray: string[] = [];
  for (const line of linesNamingTarget(stripHtmlComments(content), target)) {
    const remaining = unread.get(line) ?? 0;
    if (remaining > 0) unread.set(line, remaining - 1);
    else stray.push(line);
  }
  return stray;
}

/**
 * Select the `USER-INBOX` captures whose target line names one work unit.
 *
 * Callers that must prove no capture names the target treat a non-empty
 * `diagnostics` as unproven: an unreadable entry, or a target line the entry
 * parser never reached, may be the capture that names it.
 *
 * @param content - Complete `USER-INBOX` content.
 * @param target - The work unit's slug.
 * @returns Matching captures in file order, plus unreadable-entry and stray-line diagnostics.
 */
export function listInboxEntriesNamingTarget(content: string, target: string): InboxTargetListing {
  const entries: InboxTargetEntry[] = [];
  const diagnostics: string[] = [];
  const readLines: string[] = [];
  for (const parse of parsePersonalInboxEntries(content)) {
    if (!parse.ok) {
      diagnostics.push(parse.reason);
      continue;
    }
    const { section, key, raw } = parse.entry;
    if (section === "Memories") continue;
    const named = linesNamingTarget(raw, target);
    if (named.length === 0) continue;
    readLines.push(...named);
    entries.push({ title: key, section, held: managedFlagIsTrue(raw, "Hold") });
  }
  for (const line of strayTargetLines(content, target, readLines)) {
    diagnostics.push(`A line naming ${target} sits outside any readable inbox entry: ${line}`);
  }
  return { entries, diagnostics };
}
