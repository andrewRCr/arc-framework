/**
 * Pure planning for branch-private work-unit reference reconciliation.
 *
 * Authenticated retirement records are projected into subject transitions,
 * unique rename chains are composed, and current-work-unit artifact content is
 * partitioned into mechanical code-span edits and read-only advisory findings.
 *
 * @module
 */

import { dirname, join } from "node:path";

import { artifactMatcher } from "./mutators/relocate-artifacts.js";
import type { TransitionRecordEnumerationResult } from "./transition-record-enumeration.js";

/** One storage-independent retirement transition relevant to tracked references. */
export interface ReachableReferenceTransition {
  subject: string;
  outcome:
    | { kind: "rename"; targetSlug: string }
    | { kind: "decompose" }
    | { kind: "removed" };
}

/** Lean transition projection before current tracked-reference planning. */
export type TransitionReferenceProjectionResult =
  | { status: "valid"; transitions: readonly ReachableReferenceTransition[] }
  | { status: "conflict"; reason: "ambiguous-history"; subject: string }
  | { status: "conflict"; reason: "namespace-corrupt" };

/** One exact artifact snapshot supplied to the pure planner. */
export interface ReferenceArtifactSnapshot {
  path: string;
  content: string;
}

/** One mechanical reference replacement within an artifact. */
export interface TrackedReferenceReplacement {
  subject: string;
  targetSlug: string;
}

/** One artifact edit produced only from a unique rename chain. */
export interface TrackedReferenceEdit {
  path: string;
  content: string;
  replacements: readonly TrackedReferenceReplacement[];
}

/** One read-only reference finding requiring author judgment. */
export interface ReferenceAdvisory {
  path: string;
  line: number;
  context: string;
  referenceKind: "narrative" | "dangling-artifact";
  subject: string;
  suggestedDisposition: "review-rename" | "remove-or-retarget";
}

/** A subject whose reachable history cannot grant mechanical rewrite authority. */
export interface ReferenceTransitionConflict {
  subject: string;
  reason: "ambiguous-history" | "rename-cycle" | "namespace-corrupt";
}

/** Closed pure reference plan. */
export interface ReferenceReconcilePlan {
  status: "ready" | "conflict";
  edits: readonly TrackedReferenceEdit[];
  advisories: readonly ReferenceAdvisory[];
  conflicts: readonly ReferenceTransitionConflict[];
}

/** One subject's composed result over reachable retirement transitions. */
export type ReferenceTransitionResolution =
  | { kind: "rename"; targetSlug: string }
  | { kind: "decompose" }
  | { kind: "removed" }
  | { kind: "absent" }
  | { kind: "conflict"; reason: ReferenceTransitionConflict["reason"] };

const ARTIFACT_CODE_SPAN = /`([a-z]+)-([a-z0-9]+(?:-[a-z0-9]+)*)\.md`/gu;
const COHORT_FIELD_PREFIX = /^[ \t]*-[ \t]+\*\*Cohort:\*\*[ \t]*/gmu;
const SLUG_CHAR = /[a-z0-9-]/u;

/**
 * List the exact artifact group beside an owned meta path.
 *
 * @param slug - Current work-unit slug
 * @param metaPath - Owned meta path that anchors the artifact directory
 * @param readDirectory - Directory listing boundary
 * @returns Deterministically ordered current-WU artifact paths
 */
export async function listCurrentWuArtifactPaths(
  slug: string,
  metaPath: string,
  readDirectory: (path: string) => Promise<readonly string[]>,
): Promise<readonly string[]> {
  const directory = dirname(metaPath);
  return (await readDirectory(directory))
    .filter((basename) => basename !== `cohort-${slug}.md` && artifactMatcher(slug).test(basename))
    .sort(byteSort)
    .map((basename) => join(directory, basename));
}

/** Project authenticated lean transition groups into reference transitions. */
export function enumerateTransitionReferenceTransitions(
  enumeration: TransitionRecordEnumerationResult,
): TransitionReferenceProjectionResult {
  if (enumeration.status !== "valid") return { status: "conflict", reason: "namespace-corrupt" };
  const transitions: ReachableReferenceTransition[] = [];
  for (const group of enumeration.groups) {
    if (group.records.length > 1) {
      return { status: "conflict", reason: "ambiguous-history", subject: group.origin };
    }
    const record = group.records[0];
    if (record === undefined) return { status: "conflict", reason: "namespace-corrupt" };
    if (record.kind === "rename") {
      const targetSlug = record.successors[0];
      if (targetSlug === undefined) return { status: "conflict", reason: "namespace-corrupt" };
      transitions.push({ subject: record.origin, outcome: { kind: "rename", targetSlug } });
    } else if (record.kind === "abandon") {
      transitions.push({ subject: record.origin, outcome: { kind: "removed" } });
    } else {
      transitions.push({ subject: record.origin, outcome: { kind: "decompose" } });
    }
  }
  return { status: "valid", transitions };
}

/**
 * Plan mechanical and advisory reference handling across exact artifact snapshots.
 *
 * @param input - Reachable transitions and current-WU artifact snapshots
 * @returns Mechanical edits, advisory findings, and any history conflicts
 */
export function planReferenceReconcile(input: {
  transitions: readonly ReachableReferenceTransition[];
  artifacts: readonly ReferenceArtifactSnapshot[];
}): ReferenceReconcilePlan {
  const outcomes = groupOutcomes(input.transitions);
  const resolutions = new Map<string, ReferenceTransitionResolution>();
  const referencedSubjects = [...outcomes.keys()]
    .filter((subject) => input.artifacts.some((artifact) => {
      const cohortFieldRanges = cohortFieldValueRanges(artifact.content);
      return slugOffsets(artifact.content, subject)
        .some((offset) => !insideAnyRange(offset, cohortFieldRanges))
        || [...artifact.content.matchAll(ARTIFACT_CODE_SPAN)]
          .some((match) => match[1] !== "cohort" && match[2] === subject);
    }))
    .sort(byteSort);
  for (const subject of referencedSubjects) {
    resolutions.set(subject, resolveReferenceTransition(input.transitions, subject));
  }

  const conflicts: ReferenceTransitionConflict[] = [];
  for (const [subject, resolution] of resolutions) {
    if (resolution.kind === "conflict") conflicts.push({ subject, reason: resolution.reason });
  }
  if (conflicts.length > 0) {
    return { status: "conflict", edits: [], advisories: [], conflicts };
  }

  const edits: TrackedReferenceEdit[] = [];
  const advisories: ReferenceAdvisory[] = [];
  for (const artifact of [...input.artifacts].sort((left, right) => byteSort(left.path, right.path))) {
    const codeRanges: Array<{ start: number; end: number }> = [];
    const cohortFieldRanges = cohortFieldValueRanges(artifact.content);
    const replacements: TrackedReferenceReplacement[] = [];
    const nextContent = artifact.content.replace(
      ARTIFACT_CODE_SPAN,
      (span: string, prefix: string, subject: string, offset: number) => {
        codeRanges.push({ start: offset, end: offset + span.length });
        if (prefix === "cohort") return span;
        const resolution = resolutions.get(subject);
        if (resolution?.kind === "rename") {
          replacements.push({ subject, targetSlug: resolution.targetSlug });
          return `\`${prefix}-${resolution.targetSlug}.md\``;
        }
        if (resolution?.kind === "decompose" || resolution?.kind === "removed") {
          advisories.push(advisoryAt(
            artifact,
            offset,
            "dangling-artifact",
            subject,
            "remove-or-retarget",
          ));
        }
        return span;
      },
    );
    if (nextContent !== artifact.content) {
      edits.push({
        path: artifact.path,
        content: nextContent,
        replacements: uniqueReplacements(replacements),
      });
    }

    for (const [subject, resolution] of resolutions) {
      if (
        resolution.kind === "conflict"
        || resolution.kind === "absent"
        || resolution.kind === "decompose"
      ) continue;
      for (const offset of slugOffsets(artifact.content, subject)) {
        if (insideAnyRange(offset, codeRanges) || insideAnyRange(offset, cohortFieldRanges)) continue;
        advisories.push(advisoryAt(
          artifact,
          offset,
          "narrative",
          subject,
          resolution.kind === "rename" ? "review-rename" : "remove-or-retarget",
        ));
      }
    }
  }
  return {
    status: "ready",
    edits,
    advisories: advisories.sort(compareAdvisories),
    conflicts: [],
  };
}

function cohortFieldValueRanges(content: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const match of content.matchAll(COHORT_FIELD_PREFIX)) {
    const start = match.index + match[0].length;
    const lineEnd = content.indexOf("\n", start);
    ranges.push({ start, end: lineEnd === -1 ? content.length : lineEnd });
  }
  return ranges;
}

function insideAnyRange(offset: number, ranges: readonly { start: number; end: number }[]): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

/**
 * Compose one subject's unique acyclic transition to its terminal result.
 *
 * @param transitions - Authenticated storage-independent transitions
 * @param subject - Retired work-unit identity to resolve
 * @returns Final rename target, terminal removal, absence, or conflict
 */
export function resolveReferenceTransition(
  transitions: readonly ReachableReferenceTransition[],
  subject: string,
): ReferenceTransitionResolution {
  const outcomes = groupOutcomes(transitions);
  if (!outcomes.has(subject)) return { kind: "absent" };
  return resolveSubject(subject, outcomes, new Set());
}

function groupOutcomes(
  transitions: readonly ReachableReferenceTransition[],
): Map<string, ReachableReferenceTransition["outcome"][]> {
  const grouped = new Map<string, ReachableReferenceTransition["outcome"][]>();
  for (const transition of transitions) {
    const values = grouped.get(transition.subject) ?? [];
    const signature = JSON.stringify(transition.outcome);
    if (!values.some((value) => JSON.stringify(value) === signature)) values.push(transition.outcome);
    grouped.set(transition.subject, values);
  }
  return grouped;
}

function resolveSubject(
  subject: string,
  outcomes: ReadonlyMap<string, readonly ReachableReferenceTransition["outcome"][]>,
  visited: Set<string>,
): ReferenceTransitionResolution {
  if (visited.has(subject)) return { kind: "conflict", reason: "rename-cycle" };
  const candidates = outcomes.get(subject) ?? [];
  if (candidates.length !== 1) return { kind: "conflict", reason: "ambiguous-history" };
  const [outcome] = candidates;
  if (outcome === undefined || outcome.kind !== "rename") return outcome ?? { kind: "removed" };
  const nextVisited = new Set(visited);
  nextVisited.add(subject);
  if (!outcomes.has(outcome.targetSlug)) return outcome;
  const tail = resolveSubject(outcome.targetSlug, outcomes, nextVisited);
  return tail.kind === "rename"
    ? { kind: "rename", targetSlug: tail.targetSlug }
    : tail;
}

function slugOffsets(content: string, slug: string): number[] {
  const offsets: number[] = [];
  let offset = content.indexOf(slug);
  while (offset !== -1) {
    const before = offset === 0 ? "" : content[offset - 1] ?? "";
    const after = content[offset + slug.length] ?? "";
    if (!SLUG_CHAR.test(before) && !SLUG_CHAR.test(after)) offsets.push(offset);
    offset = content.indexOf(slug, offset + slug.length);
  }
  return offsets;
}

function advisoryAt(
  artifact: ReferenceArtifactSnapshot,
  offset: number,
  referenceKind: ReferenceAdvisory["referenceKind"],
  subject: string,
  suggestedDisposition: ReferenceAdvisory["suggestedDisposition"],
): ReferenceAdvisory {
  const before = artifact.content.slice(0, offset);
  const line = before.split("\n").length;
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEnd = artifact.content.indexOf("\n", offset);
  return {
    path: artifact.path,
    line,
    context: artifact.content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim(),
    referenceKind,
    subject,
    suggestedDisposition,
  };
}

function uniqueReplacements(
  replacements: readonly TrackedReferenceReplacement[],
): TrackedReferenceReplacement[] {
  const seen = new Set<string>();
  return replacements.filter((replacement) => {
    const signature = `${replacement.subject}\0${replacement.targetSlug}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function compareAdvisories(left: ReferenceAdvisory, right: ReferenceAdvisory): number {
  return byteSort(left.path, right.path)
    || left.line - right.line
    || byteSort(left.subject, right.subject)
    || byteSort(left.referenceKind, right.referenceKind);
}

function byteSort(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
