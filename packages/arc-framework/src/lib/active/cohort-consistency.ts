/**
 * Cross-file cohort-consistency checks over a set of backlog-scoped artifacts.
 *
 * The cohort-consistency invariant has three conditions, all structural and all
 * spanning more than one file:
 *
 *  (a) **field ↔ dir path-match** — a work unit's `**Cohort:**` field value must
 *      equal the cohort dir-path its meta file is filed under: the segments of
 *      `backlog/planned/<cohort>[/<subcohort>]/<wu>/meta-<wu>.md` between
 *      `planned/` and the work unit's own subdir. Drift (a WU assigned to one
 *      cohort but filed under another) is a silent failure this surfaces.
 *  (b) **constitutive cohort doc** — every grouping dir (a cohort dir, or any
 *      ancestor of one) carries a `cohort-<leaf>.md` with at least a `Purpose`
 *      floor. No doc-less grouping exists.
 *  (c) **member sections ⊆ derived members** — a cohort doc's per-member section
 *      slugs are a subset of the work units whose `Cohort` field resolves to that
 *      cohort. Sections are a coordination surface, not a roster, so a member with
 *      no section passes; an orphan section (slug ∉ derived members) does not.
 *
 * Membership is derived from the `Cohort` field, never from a roster. The checks
 * treat the supplied file set as their universe: callers feed the artifacts in
 * scope (e.g. a staged delta) and get diagnostics for inconsistencies within it.
 *
 * Because cohort members **relocate out** of `backlog/planned/` as they activate
 * (→ flat `active/`) and ship (→ `completed/`), a staged-delta universe alone
 * cannot tell a graduated member from a removed one — both are absent from the
 * delta. The optional `liveMembersByDir` and `existingCohortDocDirs` inputs carry
 * lifecycle-complete context resolved from the live tree, so conditions (b) and
 * (c) recognize a graduated member or an unstaged ancestor doc instead of
 * flagging it. Absent, the checks fall back to staged-delta-only reasoning.
 *
 * This module owns the cross-file reasoning; single-field shape validation (the
 * two-segment cap) stays with `validateCohortPath` in `cohort-path.ts`.
 *
 * @module
 */

import { parseMetaRecord } from "./meta-reader.js";

/** Anchors a backlog path to the `planned/` lifecycle root. */
const PLANNED_MARKER = /(?:^|\/)\.arc\/backlog\/planned\//;

/** The standalone-work-unit sentinel; resolves to the empty cohort path. */
const NONE_SENTINEL = "[none]";

/** A backlog artifact paired with its content, as fed to the checks. */
export interface BacklogFile {
  path: string;
  content: string;
}

/** The classified artifact set the cohort-consistency checks reason over. */
export interface CohortConsistencyInput {
  /** Backlog `meta-*.md` files in scope. */
  metas: BacklogFile[];
  /** Backlog `cohort-*.md` files in scope. */
  cohortDocs: BacklogFile[];
  /**
   * Cohort membership resolved across the live tree (`active/` + `backlog/planned/`
   * + `completed/`), keyed by `**Cohort:**`-field value → member slugs. Augments
   * the staged delta so a member that has graduated out of `backlog/planned/`
   * (activated or shipped) is still recognized by condition (c), not flagged as an
   * orphan section. Absent → condition (c) uses staged-derived membership only.
   */
  liveMembersByDir?: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * Grouping dirs that carry a `cohort-<leaf>.md` on disk, even when that doc is
   * not in the staged set. Lets condition (b) accept an existing ancestor cohort
   * doc instead of demanding it be re-staged on every member edit. Absent →
   * condition (b) counts staged docs only.
   */
  existingCohortDocDirs?: ReadonlySet<string>;
}

/** The grouping-dir context recovered from a cohort doc's path. */
export interface CohortDocLocation {
  /** The grouping dir-path the doc sits in, e.g. `core/sub`. */
  cohortDir: string;
  /** The dir's own (leaf) segment, e.g. `sub`. */
  leaf: string;
  /** The doc's actual filename, e.g. `cohort-sub.md`. */
  filename: string;
  /** The filename the constitutive-doc naming convention requires. */
  expectedFilename: string;
}

/** Normalize OS path separators to POSIX. */
function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * Segments of a backlog path after `.arc/backlog/planned/`, or `null` when the
 * path is not under `planned/`.
 */
function segmentsUnderPlanned(path: string): string[] | null {
  const posix = toPosix(path);
  const match = PLANNED_MARKER.exec(posix);
  if (!match) return null;
  const rest = posix.slice(match.index + match[0].length);
  return rest.split("/").filter((segment) => segment.length > 0);
}

/**
 * The cohort dir-path a meta file is filed under — the segments between
 * `planned/` and the work unit's own subdir. An empty string for a standalone WU
 * (filed directly under `planned/<wu>/`); `null` when the path is not a
 * `planned/` meta at all.
 */
export function metaCohortDir(path: string): string | null {
  const segments = segmentsUnderPlanned(path);
  if (segments === null || segments.length === 0) return null;
  // Drop the filename, then the work unit's own subdir; the rest is the cohort path.
  return segments.slice(0, -1).slice(0, -1).join("/");
}

/**
 * The work-unit name a meta file names, recovered from its `meta-<name>.md`
 * basename; `null` when the path is not a `planned/` meta.
 */
export function metaWorkUnitName(path: string): string | null {
  const segments = segmentsUnderPlanned(path);
  if (segments === null || segments.length === 0) return null;
  const filename = segments[segments.length - 1] ?? "";
  const match = /^meta-(.+)\.md$/.exec(filename);
  return match ? (match[1] ?? null) : null;
}

/**
 * The grouping-dir context a cohort doc sits in — the doc lives directly in its
 * grouping dir, so the dir-path is everything between `planned/` and the
 * filename. `null` when the path is not a `planned/` cohort doc.
 */
export function cohortDocLocation(path: string): CohortDocLocation | null {
  const segments = segmentsUnderPlanned(path);
  if (segments === null || segments.length < 2) return null;
  const filename = segments[segments.length - 1] ?? "";
  const dirSegments = segments.slice(0, -1);
  const leaf = dirSegments[dirSegments.length - 1] ?? "";
  return {
    cohortDir: dirSegments.join("/"),
    leaf,
    filename,
    expectedFilename: `cohort-${leaf}.md`,
  };
}

/** The normalized `**Cohort:**` field value — `[none]`/absent/empty → `""`. */
function normalizeCohortField(content: string): string {
  const raw = parseMetaRecord(content).Cohort;
  if (raw === null) return "";
  const trimmed = raw.trim();
  return trimmed === NONE_SENTINEL ? "" : trimmed;
}

/**
 * The normalized `**Cohort:**` field value of a meta's content — `[none]` /
 * absent / empty all resolve to `""`. The cohort-membership key for the
 * live-tree resolver: a meta belongs to the cohort its field names, regardless
 * of where the file is filed (`active/` / `backlog/planned/` / `completed/`).
 */
export function metaCohortField(content: string): string {
  return normalizeCohortField(content);
}

/** Whether a cohort doc carries a non-empty `**Purpose:**` floor. */
function hasPurposeFloor(content: string): boolean {
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*\*\*Purpose:\*\*\s*(.*)$/.exec(line);
    if (match) return (match[1] ?? "").trim().length > 0;
  }
  return false;
}

/**
 * The per-member section slugs declared under a cohort doc's `## Members`
 * section — each `### \`<slug>\`` heading. Headings outside `## Members` (the
 * coordination subsections) are ignored.
 */
function memberSlugs(content: string): string[] {
  const slugs: string[] = [];
  let inMembers = false;
  for (const line of content.split(/\r?\n/)) {
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      inMembers = (h2[1] ?? "").trim().toLowerCase() === "members";
      continue;
    }
    if (!inMembers) continue;
    const h3 = /^###\s+`([^`]+)`\s*$/.exec(line);
    if (h3) slugs.push((h3[1] ?? "").trim());
  }
  return slugs;
}

/** Add a cohort dir and every ancestor prefix to the grouping-dir set. */
function addWithPrefixes(dir: string, into: Set<string>): void {
  if (dir === "") return;
  const segments = dir.split("/");
  for (let depth = 1; depth <= segments.length; depth++) {
    into.add(segments.slice(0, depth).join("/"));
  }
}

/**
 * Run the three-condition cohort-consistency invariant over the supplied
 * artifact set, returning one diagnostic per inconsistency. An empty array means
 * the set is consistent. The set is the universe: doc presence and membership are
 * derived only from the files passed in.
 */
export function checkCohortConsistency(input: CohortConsistencyInput): string[] {
  const diagnostics: string[] = [];

  // Membership keys on the field value (the source of truth), so condition (c)
  // stays meaningful even when condition (a) is concurrently flagging drift.
  const membersByDir = new Map<string, Set<string>>();
  const groupingDirs = new Set<string>();

  // --- Condition (a): field ↔ dir path-match ---
  for (const meta of input.metas) {
    const locationCohort = metaCohortDir(meta.path);
    if (locationCohort === null) continue;
    addWithPrefixes(locationCohort, groupingDirs);

    const fieldCohort = normalizeCohortField(meta.content);
    if (fieldCohort !== locationCohort) {
      diagnostics.push(
        `${meta.path}: \`**Cohort:**\` field "${fieldCohort || NONE_SENTINEL}" ` +
          `does not match its filed location "${locationCohort || NONE_SENTINEL}"`,
      );
    }

    if (fieldCohort !== "") {
      const wu = metaWorkUnitName(meta.path);
      if (wu !== null) {
        const set = membersByDir.get(fieldCohort) ?? new Set<string>();
        set.add(wu);
        membersByDir.set(fieldCohort, set);
      }
    }
  }

  const docsByDir = new Map<string, BacklogFile & CohortDocLocation>();
  for (const doc of input.cohortDocs) {
    const location = cohortDocLocation(doc.path);
    if (location === null) continue;
    addWithPrefixes(location.cohortDir, groupingDirs);
    docsByDir.set(location.cohortDir, { ...doc, ...location });
  }

  // --- Condition (b): every grouping dir carries a cohort doc with a Purpose ---
  for (const dir of [...groupingDirs].sort()) {
    const doc = docsByDir.get(dir);
    if (doc === undefined) {
      // An ancestor cohort doc already on disk (unstaged) satisfies the
      // constitutive-doc invariant — it was validated when committed; a member
      // edit need not re-stage it.
      if (input.existingCohortDocDirs?.has(dir)) continue;
      const leaf = dir.split("/").pop() ?? dir;
      diagnostics.push(
        `.arc/backlog/planned/${dir}: grouping dir has no \`cohort-${leaf}.md\` ` +
          `(every grouping dir is constitutive — it must carry a cohort doc)`,
      );
      continue;
    }
    if (doc.filename !== doc.expectedFilename) {
      diagnostics.push(
        `${doc.path}: cohort doc filename "${doc.filename}" does not match its ` +
          `grouping dir (expected "${doc.expectedFilename}")`,
      );
    }
    if (!hasPurposeFloor(doc.content)) {
      diagnostics.push(`${doc.path}: cohort doc is missing the \`**Purpose:**\` floor`);
    }
  }

  // --- Condition (c): member sections ⊆ derived members ---
  for (const doc of input.cohortDocs) {
    const location = cohortDocLocation(doc.path);
    if (location === null) continue;
    const derived = membersByDir.get(location.cohortDir) ?? new Set<string>();
    const live = input.liveMembersByDir?.get(location.cohortDir);
    for (const slug of memberSlugs(doc.content)) {
      // A slug is an orphan only if it resolves to no member anywhere — not in
      // the staged delta, and not in the live tree. A slug that resolves to a
      // graduated member (active/completed, by `Cohort` field) is a member, not
      // a renamed/removed WU.
      if (derived.has(slug) || live?.has(slug)) continue;
      diagnostics.push(
        `${doc.path}: orphan member section \`${slug}\` ` +
          `(not a derived member of "${location.cohortDir}")`,
      );
    }
  }

  return diagnostics;
}
