/**
 * Clack summary formatters for `arc config status`.
 *
 * JSON emission is not formatter-side — the handler calls `JSON.stringify`
 * on the typed result directly. These builders produce the human-readable
 * Clack note body that pairs with the default (no-`--json`) invocation.
 */

import type { ConfigSessionInitResult, ConfigStatusResult } from "./types.js";

/** Build the Clack summary for `arc config status` (full mode). */
export function buildConfigStatusSummary(result: ConfigStatusResult): string {
  const lines: string[] = [];
  const keys = Object.keys(result.settings) as Array<keyof typeof result.settings>;
  lines.push(`${keys.length} agent-consumable settings (hooks.* excluded):`);
  lines.push("");
  for (const key of keys) {
    const marker = result.defaultsApplied.includes(key) ? " (default)" : "";
    lines.push(`  ${key}: ${result.settings[key]}${marker}`);
  }
  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warn of result.warnings) lines.push(`  - ${warn}`);
  }
  return lines.join("\n");
}

/** Build the Clack summary for `arc config status --session-init`. */
export function buildConfigSessionInitSummary(result: ConfigSessionInitResult): string {
  const lines: string[] = [];
  const keys = Object.keys(result.settings) as Array<keyof typeof result.settings>;
  lines.push("Init-gating settings:");
  for (const key of keys) {
    const marker = result.defaultsApplied.includes(key) ? " (default)" : "";
    lines.push(`  ${key}: ${result.settings[key]}${marker}`);
  }
  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warn of result.warnings) lines.push(`  - ${warn}`);
  }
  return lines.join("\n");
}
