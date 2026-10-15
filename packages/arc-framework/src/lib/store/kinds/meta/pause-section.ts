/** Semantic reader and body renderer for the verb-owned Pause section. */
import { MetaPauseSchema, type MetaPause } from "../../../active/meta-schema.js";

/** Explain prose that would interfere with the managed Pause section's grammar. */
export function pauseProseProblem(pause: MetaPause): string | null {
  const prose = [pause.reason, pause.resumeNotes, pause.waitsOn?.kind === "note" ? pause.waitsOn.text : null];
  if (prose.some((text) => text?.split(/\r?\n/u).some((line) => /^## /u.test(line) || line.trim() === "---"))) {
    return "Pause body contains a section boundary; remove the heading or delimiter and retry.";
  }
  return pause.resumeNotes?.split(/\r?\n/u).includes("### Resume Notes") === true
    ? "Pause notes contain the reserved ### Resume Notes heading; remove that heading and retry."
    : null;
}

/** Render the whole section body using labels distinct from managed fields.
 * @param value - Schema-valid pause state.
 * @returns Canonical section body.
 */
export function renderMetaPauseBody(value: MetaPause): string {
  const pause = MetaPauseSchema.parse(value);
  const prose = (text: string): string => text.replace(/\r?\n/gu, "\n  ");
  const lines = [`- **Paused By:** \`${pause.pausedBy}\``, `- **Since:** \`${pause.since}\``,
    `- **Reason:** ${prose(pause.reason)}`];
  if (pause.waitsOn !== null) lines.push(`- **Waits On:** ${pause.waitsOn.kind === "work-unit"
    ? `\`${pause.waitsOn.slug}\`` : renderPauseNote(pause.waitsOn.text, prose)}`);
  if (pause.open) lines.push("- **Open to Takers:** `true`");
  if (pause.resumeNotes !== null) lines.push("", "### Resume Notes", "", pause.resumeNotes);
  return lines.join("\n");
}

function renderPauseNote(text: string, prose: (text: string) => string): string {
  const rendered = prose(text);
  // Escape a wholly coded note so it cannot be read as a work-unit edge; one
  // extra backslash at both ends also preserves already-escaped note text.
  return /^\\*`[^`]*`$/u.test(text) ? `\\${rendered.slice(0, -1)}\\\`` : rendered;
}
