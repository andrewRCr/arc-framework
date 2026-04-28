import type {
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
  lines.push(`Saved ${result.fileCount} file(s) to git note on ${result.commit}`);
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
  lines.push(`Restored ${result.fileCount} file(s) from git note on ${result.commit}`);
  lines.push(`Identity: ${result.identity}`);

  if (result.ancestorDistance > 0) {
    lines.push(`Loaded from ${result.ancestorDistance} commit(s) back.`);
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const w of result.warnings) {
      lines.push(`  - ${w}`);
    }
  }

  return lines.join("\n");
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
