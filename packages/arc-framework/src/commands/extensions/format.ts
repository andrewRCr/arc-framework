/**
 * Clack summary formatters for `arc extensions status`.
 *
 * JSON emission is not formatter-side — the handler calls
 * `JSON.stringify` on the typed result directly. These builders produce
 * the human-readable Clack note body that pairs with the default
 * (no-`--json`) invocation.
 */

import { appendWarningsTail } from "../../lib/format/warnings.js";
import type {
  ExtensionsSessionInitResult,
  ExtensionsStatusResult,
  ExtensionSummary,
} from "./types.js";

/**
 * Build the Clack summary for `arc extensions status` (full mode).
 *
 * @param result - Status result from {@link runExtensionsStatus}
 * @returns Multi-line summary for `p.note`
 */
export function buildExtensionsStatusSummary(result: ExtensionsStatusResult): string {
  const lines: string[] = [];
  lines.push(`${result.activeCount} active · ${result.inactiveCount} inactive · ${result.orphanCount} orphaned refs`);

  const active = result.extensions.filter((e) => e.active);
  const inactive = result.extensions.filter((e) => !e.active);

  if (active.length > 0) {
    lines.push("");
    lines.push("Active:");
    for (const entry of active) lines.push(`  - ${renderExtension(entry)}`);
  }

  if (inactive.length > 0) {
    lines.push("");
    lines.push("Inactive:");
    for (const entry of inactive) lines.push(`  - ${renderExtension(entry)}`);
  }

  if (result.includeOrphanDetails) {
    lines.push("");
    if (result.orphans.length === 0) {
      lines.push("No orphaned references.");
    } else {
      lines.push("Orphaned references:");
      for (const ref of result.orphans) {
        lines.push(`  - ${ref.extensionName} · ${ref.workflowPath}:${String(ref.lineNumber)}`);
      }
    }
  }

  appendWarningsTail(lines, result.warnings);

  return lines.join("\n");
}

/**
 * Build the Clack summary for `arc extensions status --session-init`.
 *
 * @param result - Session-init-scoped result
 * @returns Multi-line summary for `p.note`
 */
export function buildExtensionsSessionInitSummary(result: ExtensionsSessionInitResult): string {
  const lines: string[] = [];
  if (result.active.length === 0) {
    lines.push("No active extensions.");
  } else {
    lines.push(`${result.active.length} active extensions:`);
    for (const name of result.active) lines.push(`- ${name}`);
  }
  appendWarningsTail(lines, result.warnings);
  return lines.join("\n");
}

function renderExtension(entry: ExtensionSummary): string {
  return `${entry.name} — ${entry.description}`;
}
