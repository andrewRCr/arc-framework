/** Shared Unicode display-width semantics for Markdown producers. */

import stringWidth from "string-width";

/** Measure text with the same terminal-column semantics used by Markdown linting. */
export function displayWidth(value: string): number {
  return stringWidth(value);
}

/** Append ASCII spaces to a requested display width without truncating content. */
export function padToDisplayWidth(value: string, width: number): string {
  return `${value}${" ".repeat(Math.max(0, width - displayWidth(value)))}`;
}
