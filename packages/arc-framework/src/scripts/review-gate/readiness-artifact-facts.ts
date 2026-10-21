/** Shared authored lifecycle obligations for repository-backed and stored readiness. */
import type { ReviewReadinessFact } from "./readiness.js";

function fact(code: string, path: string, message: string): ReviewReadinessFact {
  return { code, path, message };
}

function sectionBodies(content: string, heading: string): string[] {
  const lines = content.split(/\r?\n/u);
  const bodies: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== `## ${heading}`) continue;
    const body: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line === undefined || /^## /u.test(line)) break;
      body.push(line);
    }
    bodies.push(body.join("\n").trim());
  }
  return bodies;
}

function completionFacts(content: string, path: string): ReviewReadinessFact[] {
  const sections = sectionBodies(content, "Completion Notes");
  if (sections.length === 0) {
    return [fact("missing-completion-notes", path, "Completion Notes are required.")];
  }
  const body = sections[0]?.trim() ?? "";
  if (
    sections.length !== 1
    || body.length === 0
    || /^\[(?:none|tbd)\]$/iu.test(body)
    || containsOnlyHtmlComments(body)
  ) {
    return [fact("malformed-completion-notes", path, "Completion Notes must be unique and non-empty.")];
  }
  return [];
}

function containsOnlyHtmlComments(value: string): boolean {
  let cursor = 0;
  let comments = 0;
  while (cursor < value.length) {
    while (cursor < value.length && /\s/u.test(value[cursor] ?? "")) cursor += 1;
    if (cursor === value.length) return comments > 0;
    if (!value.startsWith("<!--", cursor)) return false;
    const end = value.indexOf("-->", cursor + 4);
    if (end === -1) return false;
    comments += 1;
    cursor = end + 3;
  }
  return comments > 0;
}

const RELEASE_NOTE_CATEGORIES = [
  "Added",
  "Changed",
  "Removed",
  "Fixed",
  "Infrastructure",
  "Deprecated",
  "Security",
] as const;

function releaseNotesFacts(content: string, path: string): ReviewReadinessFact[] {
  const sections = sectionBodies(content, "Release Notes Entry");
  if (sections.length === 0) return [];
  if (sections.length !== 1) {
    return [fact("malformed-release-notes", path, "Release Notes Entry must appear at most once.")];
  }
  const section = sections[0] ?? "";
  const lines = section.split(/\r?\n/u);
  const firstCategory = lines.findIndex((line) => /^### /u.test(line));
  if (firstCategory <= 0 || lines.slice(0, firstCategory).join("\n").trim().length === 0) {
    return [fact(
      "malformed-release-notes",
      path,
      "Release Notes Entry requires a summary followed by categorized changes.",
    )];
  }
  return releaseCategoryFacts(lines, firstCategory, path);
}

function releaseCategoryFacts(lines: readonly string[], firstCategory: number, path: string): ReviewReadinessFact[] {
  const seen = new Set<string>();
  let previousIndex = -1;
  let categorized = 0;
  for (let index = firstCategory; index < lines.length;) {
    const heading = /^### (.+)$/u.exec(lines[index] ?? "")?.[1];
    if (heading === undefined) {
      return [fact("malformed-release-notes", path, "Release Notes content must stay inside named categories.")];
    }
    const next = lines.findIndex((line, cursor) => cursor > index && /^### /u.test(line));
    const end = next === -1 ? lines.length : next;
    const body = lines.slice(index + 1, end).filter((line) => line.trim().length > 0);
    if (body.length === 0) {
      return [fact("malformed-release-notes", path, `Release Notes category '${heading}' is empty.`)];
    }
    if (heading === "Breaking Changes") {
      if (end !== lines.length || seen.has(heading)) {
        return [fact(
          "malformed-release-notes",
          path,
          "Breaking Changes may appear once, after the categorized changes.",
        )];
      }
      seen.add(heading);
      index = end;
      continue;
    }
    const categoryIndex = RELEASE_NOTE_CATEGORIES.indexOf(
      heading as (typeof RELEASE_NOTE_CATEGORIES)[number],
    );
    if (
      categoryIndex === -1
      || categoryIndex <= previousIndex
      || seen.has(heading)
      || !/^- \S/u.test(body[0] ?? "")
      || !body.every((line) => /^- \S/u.test(line) || /^\s{2,}\S/u.test(line))
    ) {
      return [fact(
        "malformed-release-notes",
        path,
        "Release Notes categories must be unique, ordered, supported, and contain non-empty list items.",
      )];
    }
    seen.add(heading);
    previousIndex = categoryIndex;
    categorized += 1;
    index = end;
  }
  if (categorized === 0) {
    return [fact("malformed-release-notes", path, "Release Notes Entry requires at least one change category.")];
  }
  return [];
}

/**
 * Collect the lifecycle-artifact facts a work-unit meta owes before merge: Completion
 * Notes are required, and a Release Notes Entry is validated whenever one is present.
 *
 * @param content - The work-unit meta's full text.
 * @param path - The meta's path, reported on each fact.
 * @returns One fact per unmet obligation; empty when the artifacts are satisfied.
 */
export function lifecycleArtifactFacts(content: string, path: string): ReviewReadinessFact[] {
  return [...completionFacts(content, path), ...releaseNotesFacts(content, path)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** Validate the authored final-member closeout section of a completed cohort. */
export function validCohortCloseout(content: string, slug: string): boolean {
  const sections = sectionBodies(content, "Closeout");
  if (sections.length !== 1) return false;
  const body = sections[0] ?? "";
  return /^- \*\*Closed:\*\* \d{4}-\d{2}-\d{2}$/mu.test(body)
    && new RegExp(`^- \\*\\*Final member:\\*\\* \`${escapeRegExp(slug)}\`$`, "mu").test(body)
    && /^- \*\*Member archives:\*\* \S.+$/mu.test(body)
    && /^- \*\*Outcome:\*\* \S.+$/mu.test(body)
    && /^- \*\*Follow-up:\*\* \S.+$/mu.test(body);
}
