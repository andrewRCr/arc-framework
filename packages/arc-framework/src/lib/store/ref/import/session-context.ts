/** Fold an owner's live legacy session notes into its imported metadata record. */
import type { ImportRecord } from "./source.js";
import type { MigrateReport } from "../../commands.js";
import { parseMetaRecord } from "../../../active/meta-reader.js";
import { writeMetaSessionContext } from "../../kinds/meta/section-writer.js";
import { writeMetaCommitAtHandoff, writeMetaSessionType, writeMetaNextTask, writeMetaLastCompleted } from "../../kinds/meta/bullet-writers.js";
import { extractField, stripInlineCode, locateMetaFieldBlock } from "../../kinds/meta/line-reading.js";
import { stripHtmlComments } from "../../../user-sync/parser.js";

/** Return whether this source belongs to a live meta, retaining explicit writer refusals. */
export function foldImportSession(source: ImportRecord, records: ImportRecord[], report: MigrateReport): boolean {
  if (source.reference.kind !== "personal/session-context" || typeof source.reference.key !== "string") return false;
  const name = source.reference.key;
  const primary = records.find(record => record.reference.kind === "work-item/meta" && record.placement?.kind !== "completed"
    && record.reference.owner.name === name && parseMetaRecord(record.content).owner === source.reference.owner.name);
  if (!primary) return false;
  try {
    const fields = parseMetaRecord(primary.content);
    const visible = stripHtmlComments(source.content);
    const handoff = token(extractField(visible, "Commit at Handoff"));
    const sessionType = token(extractField(visible, "Session Type"))?.toLowerCase();
    const prose = sessionProse(visible);
    if (fields.blockers !== null) prose.push(`### Blockers\n\n${fields.blockers}`);
    let content = writeMetaSessionContext(primary.content, prose.join("\n\n"));
    content = dropLegacyProgress(writeMetaNextTask(writeMetaLastCompleted(content, null), null));
    content = writeMetaCommitAtHandoff(content, handoff);
    content = writeMetaSessionType(content, sessionType === "planning" || sessionType === "execution" ? sessionType : null);
    primary.content = content;
  } catch {
    report.refused.push({ reference: source.reference, rule: "session-context" });
    report.notices.push({ condition: `Session notes for ${source.reference.owner.name}/${name} cannot be folded into their live meta.`,
      remedy: { text: "Remove interior section boundaries from the session prose and restore a valid meta, save and load the repaired notes from that work unit's checkout, then retry arc store migrate --import." } });
  }
  return true;
}

function token(value: string | null): string | null {
  return value === null || value === "[none]" ? null : stripInlineCode(value);
}

function sessionProse(content: string): string[] {
  const lines = content.replace(/\r\n/gu, "\n").split("\n");
  const end = lines.map(line => line.trim()).lastIndexOf("---");
  if (end >= 0 && lines.slice(end + 1).every(line => line.trim() === "" || /^\[[^\]]+\]: /u.test(line))) lines.splice(end);
  const sections: { heading: string; body: string[] }[] = [], preamble: string[] = [];
  for (const line of lines) {
    if (/^## /u.test(line)) sections.push({ heading: line.slice(3).trimEnd(), body: [] });
    else if (sections.length) sections.at(-1)?.body.push(line);
    else if (!/^# /u.test(line) && !/^[ \t]*>/u.test(line)) preamble.push(line);
  }
  const prose = sections.flatMap(section => {
    const body = section.heading === "Handoff Metadata" ? withoutHandoffFields(section.body) : section.body.join("\n").trim();
    return section.heading === "Handoff Metadata" && body === "" ? [] : [`### ${section.heading}${body ? `\n\n${body}` : ""}`];
  });
  const leading = withoutHandoffFields(preamble);
  return leading ? [leading, ...prose] : prose;
}

function withoutHandoffFields(lines: string[]): string {
  const remaining: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^[ \t>*+-]*\*\*(?:Working On|Commit at Handoff|Session Type):\*\*/u.test(line)) { skipping = true; continue; }
    if (skipping && /^[ \t]+\S/u.test(line)) continue;
    skipping = false;
    remaining.push(line);
  }
  return remaining.join("\n").trim();
}

function dropLegacyProgress(content: string): string {
  const block = locateMetaFieldBlock(content);
  for (const line of [...block.lines.slice(block.h1Index + 1, block.fieldEndIndex)].reverse()) {
    if (/^[ \t>*+-]*\*\*(?:Next Task|Last Completed):\*\*/u.test(line.text)) {
      content = content.slice(0, line.startOffset) + content.slice(line.endOffset);
    }
  }
  return content;
}
