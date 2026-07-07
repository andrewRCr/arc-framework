import { noteOffBranchHistoryClause } from "./ancestry-message.js";
import type { UserCompactResult } from "./compact.js";
import type {
  LoadMessage,
  LoadMessageLevel,
  UserLoadResult,
  UserSaveResult,
  UserSessionInitStatusResult,
  UserStatusResult,
} from "./types.js";

/**
 * Build user-facing summary for a save result.
 *
 * @param result - Save result
 * @returns Formatted message for terminal display
 */
export function buildSaveSummary(result: UserSaveResult): string {
  const lines: string[] = [];
  lines.push(`Saved ${result.fileCount} file(s) to user notes on ${result.commit}`);
  lines.push(`Identity: ${result.identity}`);

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Skipped files:");
    for (const w of result.warnings) {
      lines.push(`  - ${w.path} (${w.detail})`);
    }
  }

  return lines.join("\n");
}

/**
 * Build user-facing summary for a load result.
 *
 * @param result - Load result
 * @returns Formatted message for terminal display
 */
export function buildLoadSummary(result: UserLoadResult): string {
  const lines: string[] = [];
  lines.push(`Restored ${result.fileCount} file(s) from user notes on ${result.commit}`);
  lines.push(`Identity: ${result.identity}`);

  if (result.reachableFromHead === false) {
    lines.push(`This note is ${noteOffBranchHistoryClause(result.currentBranch ?? null)}.`);
  } else if (result.ancestorDistance > 0) {
    lines.push(`Loaded from ${result.ancestorDistance} commit(s) back.`);
  }

  appendMessageGroup(lines, result.messages, "cleanup", "Cleaned up:");
  appendMessageGroup(lines, result.messages, "notice", "Notices:");
  appendMessageGroup(lines, result.messages, "warning", "Warnings:");

  return lines.join("\n");
}

/**
 * Append one register's messages under a heading, skipping the group entirely
 * when empty so a routine load surfaces no headings at all.
 */
function appendMessageGroup(
  lines: string[],
  messages: LoadMessage[],
  level: LoadMessageLevel,
  heading: string,
): void {
  const group = messages.filter((m) => m.level === level);
  if (group.length === 0) return;
  lines.push("");
  lines.push(heading);
  for (const m of group) {
    lines.push(`  - ${m.text}`);
  }
}

/**
 * Build user-facing summary for `arc user status`.
 *
 * @param result - Status result
 * @returns Formatted message for terminal display
 */
export function buildUserStatusSummary(result: UserStatusResult): string {
  const lines = [result.summary, ...result.detailLines];
  return lines.join("\n");
}

/** Build user-facing summary for `arc user compact`. */
export function buildUserCompactSummary(result: UserCompactResult): string {
  switch (result.kind) {
    case "compacted": {
      const lines = [
        `Compacted user notes generation ${result.generation}.`,
        `Retained ${result.retainedCount} note(s); pruned ${result.prunedCount} note(s).`,
        `Backup ref: ${result.backupRef}`,
        `Generation marker: ${result.marker}.`,
      ];
      if (result.backupPrune.deletedRefs.length > 0) {
        lines.push(`Expired backups pruned: ${result.backupPrune.deletedRefs.join(", ")}`);
      }
      if (result.backupPrune.failedRefs.length > 0) {
        lines.push(`Expired backup prune failures: ${result.backupPrune.failedRefs.length}.`);
      }
      return lines.join("\n");
    }
    case "nothing-to-prune":
      return `Nothing to prune. Retained ${result.retainedCount} note(s).`;
    case "lease-declined":
      return "Compaction lease declined; local notes were restored to the pre-compaction tip.";
    case "conflict":
      return result.message;
    case "no-remote":
      return "No remote configured or reachable for compaction.";
    case "failed":
      return result.error.message;
  }
}

/**
 * Build user-facing summary for `arc user status --session-init`.
 *
 * @param result - Session-init probe result
 * @returns Formatted message for terminal display
 */
export function buildUserSessionInitStatusSummary(result: UserSessionInitStatusResult): string {
  const lines = [result.summary, ...result.detailLines];
  return lines.join("\n");
}
