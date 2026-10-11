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
import { parseCrossWuEntries } from "./parser.js";
import type { CrossWuEntry } from "./schema.js";

/** One capture whose target line names the requested work unit. */
export interface InboxTargetEntry {
  readonly title: string;
  readonly section: Exclude<CrossWuEntry["section"], "Memories">;
  /** Whether the capture carries `` _Hold:_ `true` ``. */
  readonly held: boolean;
}

/** Selected captures in file order, plus every entry block that could not be read. */
export interface InboxTargetListing {
  readonly entries: readonly InboxTargetEntry[];
  readonly diagnostics: readonly string[];
}

const TARGET_LINE = /^- (?:`WU_Target:\s*([^`]+)`|_WU_Target:_\s*`([^`]+)`|WU_Target:\s*(.+))/u;
const TARGET_VALUE = /^([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+\((?:planned|provisional)\))?\s*$/u;

/** Slugs named by an entry block's top-level target lines. */
function entryTargets(raw: string): string[] {
  const targets: string[] = [];
  for (const line of raw.split("\n")) {
    const match = TARGET_LINE.exec(line.trimEnd());
    const value = (match?.[1] ?? match?.[2] ?? match?.[3])?.trim();
    const slug = value === undefined ? undefined : TARGET_VALUE.exec(value)?.[1];
    if (slug !== undefined) targets.push(slug);
  }
  return targets;
}

/**
 * Select the `USER-INBOX` captures whose target line names one work unit.
 *
 * Callers that must prove no capture names the target treat a non-empty
 * `diagnostics` as unproven: an unreadable entry may carry the target line.
 *
 * @param content - Complete `USER-INBOX` content.
 * @param target - The work unit's slug.
 * @returns Matching captures in file order, plus unreadable-entry diagnostics.
 */
export function listInboxEntriesNamingTarget(content: string, target: string): InboxTargetListing {
  const entries: InboxTargetEntry[] = [];
  const diagnostics: string[] = [];
  for (const parse of parseCrossWuEntries(content, "user-inbox")) {
    if (!parse.ok) {
      diagnostics.push(parse.reason);
      continue;
    }
    const { section, key, raw } = parse.entry;
    if (section === "Memories" || !entryTargets(raw).includes(target)) continue;
    entries.push({ title: key, section, held: managedFlagIsTrue(raw, "Hold") });
  }
  return { entries, diagnostics };
}
