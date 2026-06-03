/**
 * Status view render core — the pure `(slice, columns) → canonical-markdown`
 * primitive shared by the user-scoped in-flight view (`arc status --user`) and,
 * later, the project readiness view's file writer. It is the one place the
 * render standard becomes executable: a renderer and a hand-edit must both
 * produce this exact output.
 *
 * The renderer takes an already-resolved row slice (dependency satisfaction and
 * priority resolved upstream) plus the per-table column set, applies the uniform
 * sort key, drops the conditional `Priority` column when no row carries a value,
 * and emits a width-padded markdown table. Output is byte-stable for identical
 * inputs, so re-rendering never produces spurious diffs.
 *
 * @module
 */

import type { InFlightState } from "../git/in-flight-derivation.js";
import type { Priority } from "../../commands/active/types.js";

/** One row of a status view — a work unit's render-relevant fields, pre-resolved. */
export interface StatusViewRow {
  /** Canonical WU-name — the row's identity and total-order sort tiebreak. */
  workUnit: string;
  /** Lifecycle phase, surfaced in the State column. */
  state?: InFlightState;
  /** Attention level; absent → `P3` baseline for sort and render. */
  priority?: Priority;
  /** Owner; rendered only by tiers whose column set carries Owner. */
  owner?: string;
  /** Unsatisfied dependency WU-names; empty → em-dash cell. */
  dependsOn?: readonly string[];
  /** Cohort membership; absent → em-dash cell. */
  cohort?: string;
}

/** A render-standard column. */
export type StatusColumn = "workUnit" | "state" | "priority" | "owner" | "dependsOn" | "cohort";

/**
 * The `STATUS.USER` (in-flight-mine) column set — Owner omitted (constant
 * `= me`). `Priority` is conditional: dropped when no row carries a value.
 */
export const STATUS_USER_COLUMNS = [
  "workUnit",
  "state",
  "priority",
  "dependsOn",
  "cohort",
] as const satisfies readonly StatusColumn[];

/** Cell value for an empty / absent field. */
const EM_DASH = "—";

/** Sort rank per priority level — `P1` (top focus) sorts first. */
const PRIORITY_RANK: Record<Priority, number> = { P1: 0, P2: 1, P3: 2 };

/**
 * The uniform render-standard sort key: `(priority, cohort, wu-name)`. Absent
 * priority resolves to the `P3` baseline; an absent cohort sorts after every
 * named cohort; the canonical WU-name is the total-order tiebreak, so identical
 * inputs always render byte-identically.
 *
 * Exported as the single source of the standard's ordering. The render core
 * applies it internally so no view can diverge from the uniform key; downstream
 * renderers (the project readiness view, the managed-doc file writer) reuse this
 * exact comparator — e.g. sorting within each Blocked depth band — rather than
 * reimplementing it and risking cross-view drift.
 */
export function compareStatusRows(a: StatusViewRow, b: StatusViewRow): number {
  const priority = PRIORITY_RANK[a.priority ?? "P3"] - PRIORITY_RANK[b.priority ?? "P3"];
  if (priority !== 0) return priority;
  const cohort = compareCohort(a.cohort, b.cohort);
  if (cohort !== 0) return cohort;
  return a.workUnit.localeCompare(b.workUnit);
}

/** Order cohorts lexicographically, with absent cohorts sorting after named ones. */
function compareCohort(a: string | undefined, b: string | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a.localeCompare(b);
}

/** Header label per column. */
const COLUMN_HEADERS: Record<StatusColumn, string> = {
  workUnit: "Work unit",
  state: "State",
  priority: "Priority",
  owner: "Owner",
  dependsOn: "Depends on",
  cohort: "Cohort",
};

/** Resolve one column's cell value for a row. */
function cellOf(row: StatusViewRow, column: StatusColumn): string {
  switch (column) {
    case "workUnit":
      return row.workUnit;
    case "state":
      return row.state ?? EM_DASH;
    case "priority":
      return row.priority ?? "P3";
    case "owner":
      return row.owner ?? EM_DASH;
    case "dependsOn":
      return row.dependsOn && row.dependsOn.length > 0 ? row.dependsOn.join(", ") : EM_DASH;
    case "cohort":
      return row.cohort ?? EM_DASH;
  }
}

/** Format a header + body grid into a width-padded markdown table. */
function formatTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = headers.map((header, col) =>
    rows.reduce((max, row) => Math.max(max, (row[col] ?? "").length), header.length),
  );
  const line = (cells: readonly string[]): string =>
    `| ${cells.map((cell, col) => cell.padEnd(widths[col] ?? 0)).join(" | ")} |`;
  const separator = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
  return [line(headers), separator, ...rows.map(line)].join("\n");
}

/**
 * Render a status view slice to a canonical-markdown table.
 *
 * @param slice - The rows to render (dependency / priority pre-resolved).
 * @param columns - The per-table column set; the conditional `Priority` column
 *   is dropped when no row carries a value.
 * @returns The width-padded markdown table — byte-stable for identical inputs.
 */
export function renderStatusTable(
  slice: readonly StatusViewRow[],
  columns: readonly StatusColumn[],
): string {
  const effectiveColumns = columns.filter(
    (column) => column !== "priority" || slice.some((row) => row.priority !== undefined),
  );
  const headers = effectiveColumns.map((column) => COLUMN_HEADERS[column]);
  const sorted = [...slice].sort(compareStatusRows);
  const rows = sorted.map((row) => effectiveColumns.map((column) => cellOf(row, column)));
  return formatTable(headers, rows);
}
