/**
 * Clack summary formatters for `arc active status`.
 *
 * JSON emission is not formatter-side — the handler calls `JSON.stringify`
 * on the typed result directly. These builders produce the human-readable
 * Clack note body that pairs with the default (no-`--json`) invocation.
 */

import type {
  ActiveSessionInitResult,
  ActiveStatusResult,
  StatusFileCandidate,
} from "./types.js";

/** Build the Clack summary for `arc active status` (full mode). */
export function buildActiveStatusSummary(result: ActiveStatusResult): string {
  const lines: string[] = [];
  const count = result.candidates.length;
  const noun = count === 1 ? "work unit" : "work units";
  lines.push(`${count} active ${noun} (layout: ${result.layout}):`);

  if (count === 0) {
    lines.push("");
    lines.push("No active status files found.");
  } else {
    for (const candidate of result.candidates) {
      lines.push("");
      lines.push(`  ${candidate.filename}`);
      lines.push(`    path:       ${candidate.path}`);
      lines.push(`    branch:     ${formatValue(candidate.branch)}`);
      lines.push(`    state:      ${formatValue(candidate.state)}`);
      lines.push(`    next task:  ${formatValue(candidate.nextTask)}`);
      lines.push(`    task list:  ${formatValue(candidate.taskList)}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const w of result.warnings) lines.push(`  - ${w}`);
  }

  return lines.join("\n");
}

/** Build the Clack summary for `arc active status --session-init`. */
export function buildActiveSessionInitSummary(result: ActiveSessionInitResult): string {
  const lines: string[] = [];

  if (result.resolution === "none") {
    lines.push("No active work unit.");
  } else if (result.resolution === "single") {
    lines.push(`Resolved: ${result.path ?? "(unknown)"}`);
  } else {
    lines.push(`${result.candidates.length} candidates — disambiguation required:`);
    for (const candidate of result.candidates) lines.push(`  - ${renderCandidate(candidate)}`);
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const w of result.warnings) lines.push(`  - ${w}`);
  }

  return lines.join("\n");
}

function formatValue(value: string | null): string {
  return value === null ? "(unset)" : value;
}

function renderCandidate(candidate: StatusFileCandidate): string {
  const branch = candidate.branch ?? "(unset)";
  const state = candidate.state ?? "(unset)";
  return `${candidate.filename} · ${branch} · ${state}`;
}
