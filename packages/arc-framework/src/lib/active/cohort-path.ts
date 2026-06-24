/**
 * Cohort path-value semantics for the meta `**Cohort:**` field.
 *
 * The field carries grouping membership as a path that mirrors the on-disk
 * cohort directory: a single segment for a top-level cohort,
 * `<cohort>/<subcohort>` for a nested one, capped at two segments. The `[none]`
 * sentinel marks a standalone work unit. The field stays the source of truth
 * for membership; this module supplies the shape validation (the two-segment
 * cap) and the leaf-segment derivation the render surfaces consume.
 *
 * @module
 */

/** Maximum cohort path depth — a top-level cohort plus one nested subcohort. */
export const COHORT_SEGMENT_CAP = 2;

/** The standalone-work-unit sentinel; carries no cohort path. */
const NONE_SENTINEL = "[none]";

/**
 * Split a cohort path into its trimmed, non-empty segments. The `[none]`
 * sentinel and the empty string yield no segments.
 */
function cohortSegments(value: string): string[] {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === NONE_SENTINEL) return [];
  return trimmed
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

/**
 * Validate a cohort path value's shape. Returns `null` when the value is valid
 * — a single segment, a two-segment `<cohort>/<subcohort>` path, or the
 * `[none]` sentinel — and a human-readable error message when a segment is
 * empty (trailing or doubled slash) or the two-segment cap is exceeded.
 *
 * @param value - The raw `**Cohort:**` value (backticks already stripped).
 * @returns An error message, or `null` when the shape is valid.
 */
export function validateCohortPath(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === NONE_SENTINEL) return null;
  if (trimmed.split("/").some((segment) => segment.trim().length === 0)) {
    return `empty segment in cohort path "${value}"`;
  }
  const segments = cohortSegments(value);
  if (segments.length > COHORT_SEGMENT_CAP) {
    return (
      `cohort path "${value}" exceeds the ${COHORT_SEGMENT_CAP}-segment cap ` +
      `(found ${segments.length})`
    );
  }
  return null;
}

/**
 * Reject a cohort path that could escape its grouping directory once
 * interpolated into a filesystem path. A safe value has only relative,
 * single-name segments: no `..` traversal, no leading `/` (absolute escape), no
 * backslash (Windows separator), and no Windows drive letter (`C:`). The
 * `[none]` sentinel and the empty string are safe (they carry no path).
 *
 * This guards every callsite that builds a path from the field (e.g. the
 * archival cohort-doc sweep) — shape validation ({@link validateCohortPath})
 * caps depth but does not forbid traversal sequences.
 *
 * @param value - The raw `**Cohort:**` value (backticks already stripped).
 * @returns `true` when the value is safe to interpolate into a path.
 */
export function isSafeCohortPath(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === NONE_SENTINEL) return true;
  if (trimmed.startsWith("/") || trimmed.includes("\\")) return false;
  if (/^[A-Za-z]:/.test(trimmed)) return false;
  return cohortSegments(value).every((segment) => segment !== "..");
}

/**
 * Derive the leaf (most specific) segment of a cohort path — the subcohort for
 * a nested path, the cohort itself for a single segment. Values with no path
 * (`[none]`, empty) return trimmed unchanged: there is no leaf to derive.
 *
 * @param value - The raw `**Cohort:**` value (backticks already stripped).
 * @returns The leaf segment for render.
 */
export function cohortLeaf(value: string): string {
  const segments = cohortSegments(value);
  if (segments.length === 0) return value.trim();
  return segments[segments.length - 1] ?? value.trim();
}

/**
 * Derive the nested-parent segment of a cohort path — the first segment of a
 * two-segment `<cohort>/<subcohort>` path, or `null` when there is no parent (a
 * single-segment cohort, the `[none]` sentinel, or empty). The dual of
 * {@link cohortLeaf}: the parent is the grouping the subcohort nests under.
 *
 * @param value - The raw `**Cohort:**` value (backticks already stripped).
 * @returns The parent segment for a nested path, or `null` when none.
 */
export function cohortParent(value: string): string | null {
  const segments = cohortSegments(value);
  if (segments.length < 2) return null;
  return segments[0] ?? null;
}
