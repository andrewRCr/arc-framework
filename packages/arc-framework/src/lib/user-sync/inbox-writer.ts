/**
 * Targeted `USER-INBOX` entry removal — the write-side complement to errand
 * completion. Errand completion drops the originating capture; this is the
 * missing writer (the readers already live in `parser.ts` / `inbox-state.ts`).
 *
 * The removal is **title-keyed** (the interim match key until OSD's `_Slug:_`
 * field owns identity), **idempotent** (a no-op when the entry is absent), and
 * **targeted** — a single entry block is excised and the rest of the file stays
 * byte-stable, so it maps to a future inbox-as-event-log drain *event* rather
 * than a whole-file re-render. The writer mirrors the parser's view of an entry:
 * an H3 managed-entry within `## Errand` / `## Work Unit`, where the section runs
 * to the next `## ` heading or `---` rule. An H3 beyond that boundary is out of
 * the reader's view, so the writer leaves it untouched too.
 *
 * @module
 */

import { matchInboxEntryTitle } from "./parser.js";

/** Sections whose H3 children are routable inbox entries. */
const ENTRY_SECTIONS = ["Errand", "Work Unit"];

/** Outcome of a targeted removal. */
export interface RemoveInboxEntryResult {
  /** The file content, with the matched entry excised — unchanged when none matched. */
  content: string;
  /** Whether a matching entry was found and removed. */
  removed: boolean;
}

/** Whether a line ends an entry section or an entry block — the next `## ` heading or `---` rule. */
function isSectionBoundary(line: string): boolean {
  const trimmed = line.trimEnd();
  return trimmed.startsWith("## ") || trimmed === "---";
}

/** Whether a line opens an H3 managed-entry block. */
function isEntryHeading(line: string): boolean {
  return /^###\s/.test(line);
}

/**
 * Remove the title-matched H3 entry from a `USER-INBOX` file.
 *
 * Scans the `## Errand` and `## Work Unit` sections for the first entry whose bold
 * title equals `title` (whitespace-trimmed on both sides), then excises that
 * block — its heading through the blank lines before the next entry or the
 * section boundary. Siblings and every other line stay byte-identical. When no
 * entry matches, the content is returned unchanged.
 *
 * @param content - The `USER-INBOX` file's full text.
 * @param title - The entry's bold title (the interim slug key).
 * @returns The (possibly unchanged) content and whether a removal occurred.
 */
/**
 * List bold titles of managed entries under `## Errand` and `## Work Unit`.
 *
 * @param content - The `USER-INBOX` file's full text.
 * @returns Entry titles in document order (duplicates preserved if present).
 */
export function listInboxEntryTitles(content: string): string[] {
  const titles: string[] = [];
  const lines = content.split("\n");
  let inEntrySection = false;
  for (const line of lines) {
    const heading = line.trimEnd().match(/^## (.+)$/);
    if (heading) {
      inEntrySection = ENTRY_SECTIONS.includes((heading[1] ?? "").trim());
      continue;
    }
    if (line.trimEnd() === "---") {
      inEntrySection = false;
      continue;
    }
    if (!inEntrySection || !isEntryHeading(line)) continue;
    const title = matchInboxEntryTitle(line);
    if (title !== null) titles.push(title);
  }
  return titles;
}

export function removeInboxEntry(content: string, title: string): RemoveInboxEntryResult {
  const target = title.trim();
  const lines = content.split("\n");

  let inEntrySection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const heading = line.trimEnd().match(/^## (.+)$/);
    if (heading) {
      inEntrySection = ENTRY_SECTIONS.includes((heading[1] ?? "").trim());
      continue;
    }
    if (line.trimEnd() === "---") {
      inEntrySection = false;
      continue;
    }
    if (!inEntrySection || !isEntryHeading(line)) continue;
    if (matchInboxEntryTitle(line) !== target) continue;

    // Excise [heading .. next entry / section boundary), absorbing the block's
    // trailing blank lines so no doubled blank is left behind.
    let end = i + 1;
    while (end < lines.length && !isEntryHeading(lines[end] ?? "") && !isSectionBoundary(lines[end] ?? "")) {
      end++;
    }
    const kept = [...lines.slice(0, i), ...lines.slice(end)];
    return { content: kept.join("\n"), removed: true };
  }

  return { content, removed: false };
}
