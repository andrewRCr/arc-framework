/** Move legacy draft buffers and held captures into their work item's inbound list. */
import type { RefBackendContext } from "../context.js";
import type { ImportRecord } from "./source.js";
import type { MigrateReport } from "../../commands.js";
import { maskComments, rejoinEntryList, splitEntryList } from "../../concurrency/entries.js";
import { readEntryField, targetNamedByLine, writeEntryFields } from "../../kinds/entry-fields.js";
import { RecordReferenceSchema } from "../../identity.js";
import { appendEntry } from "../../../inbox/entry-text.js";
import { reportImportGrammar } from "./admission.js";
import { hasExecuteBoundDisposition } from "../../../user-sync/inbox-writer.js";

const bufferSection = "Inbound Buffer — Pending Integration";
const inboundIntroductions = new Set([
  "Routed-in concern pending holistic integration into the body at this WU's next planning iteration (`drain-inbox \u00a7 5`).",
  "Routed-in concerns pending holistic integration into the body at this WU's next planning iteration (`drain-inbox \u00a7 5`); each carries its origin. Integrate — or consciously reject — at iteration.",
  "Routed-in concerns pending holistic integration into the body at this WU's next planning iteration.",
  "Routed-in concerns pending holistic integration into the body at this work unit's next planning iteration; each carries its origin. Integrate — or consciously reject — at iteration.",
  "Routed-in concerns pending integration at this work unit's first planning iteration. Integrate — or consciously reject — each one.",
  "Routed-in concerns pending integration at this work unit's next planning iteration.",
  "Routed-in concerns pending integration at this work unit's next planning iteration. Integrate — or consciously reject — each one.",
  "Routed-in concerns pending integration by this work unit’s owner.",
]);

type Registry = RefBackendContext["registry"];

/** Move complete buffer sections before processing held personal captures. */
export function importInboundEntries(registry: Registry, records: ImportRecord[], report: MigrateReport): void {
  for (const draft of records.filter(record => record.reference.kind === "work-item/draft")) importBuffer(registry, records, draft, report);
  const grammar = registry["personal/inbox"].entry;
  if (!grammar) return;
  for (const inbox of records.filter(record => record.reference.kind === "personal/inbox")) {
    const split = splitEntryList(inbox.content, grammar);
    inbox.content = rejoinEntryList({ parts: split.parts.filter(part => {
      if (part.kind !== "entry" || readEntryField(maskComments(part.bytes), "Hold") !== "true" || hasExecuteBoundDisposition(part.bytes)) return true;
      const target = maskComments(part.bytes).split("\n").map(targetNamedByLine).find(value => value !== undefined);
      if (!target) return true;
      const meta = records.find(record => record.reference.kind === "work-item/meta" && record.reference.owner.name === target);
      if (!meta) {
        report.notices.push({ condition: `Held capture names missing work unit '${target}'.`,
          remedy: { text: "Restore that work unit or correct the capture's WU_Target, then retry arc store migrate --import." } });
        return true;
      }
      return !appendInbound(registry, records, meta, part.bytes, report);
    }) });
  }
}

function importBuffer(registry: Registry, records: ImportRecord[], draft: ImportRecord, report: MigrateReport): void {
  const original = draft.content;
  const visible = maskComments(original);
  const sections = [...visible.matchAll(/^## Inbound Buffer — Pending Integration\r?$/gmu)];
  const removed: { start: number; end: number }[] = [];
  for (const section of sections) {
    const start = section.index;
    const restAt = start + section[0].length;
    const boundary = /^## /gmu.exec(visible.slice(restAt));
    const end = boundary === null ? original.length : restAt + boundary.index;
    const parts = splitBufferParts(original.slice(restAt, end));
    if (parts.some(part => part.kind === "outside" && maskComments(part.bytes).trim().length > 0)) {
      report.notices.push({ condition: `The inbound buffer for '${draft.reference.owner.name}' has unaccounted prose outside its routed entries.`,
        remedy: { text: "Repair the buffer by placing pending prose in dated routed entries, or explicitly move it outside the buffer, then retry arc store migrate --import." } });
      continue;
    }
    const entries = parts.filter(part => part.kind === "entry");
    const dated = entries.map(entry => ({ entry, date: routedDate(entry.bytes) }));
    if (dated.some(({ date }) => date === undefined)) {
      report.notices.push({ condition: `The inbound buffer for '${draft.reference.owner.name}' has an entry without a dated Routed from field.`,
        remedy: { text: "Add the routing date to that entry's Routed from field, then retry arc store migrate --import." } });
      continue;
    }
    if (dated.every(({ entry, date }) => appendInbound(registry, records, draft, writeEntryFields(entry.bytes, { Created: date }), report))) {
      removed.push({ start, end });
    }
  }
  for (const { start, end } of removed.reverse()) draft.content = draft.content.slice(0, start) + draft.content.slice(end);
}

function splitBufferParts(content: string): ReturnType<typeof splitEntryList>["parts"] {
  const framing = `## ${bufferSection}\n`, visible = maskComments(content);
  const fragments: string[] = [];
  let start = inboundIntroductionEnd(visible);
  for (const separator of visible.matchAll(/^---[ \t]*\r?$/gmu)) {
    fragments.push(content.slice(start, separator.index));
    start = separator.index + separator[0].length;
  }
  fragments.push(content.slice(start));
  return fragments.flatMap(fragment => splitEntryList(framing + fragment, { shape: "heading", sections: [bufferSection] }).parts
    .map((part, index) => index === 0 && part.kind === "outside" ? { ...part, bytes: part.bytes.slice(framing.length) } : part));
}

function inboundIntroductionEnd(visible: string): number {
  const quote = /^[ \t\r\n]*(?:>[^\r\n]*(?:\r?\n|$))+/u.exec(visible)?.[0];
  if (!quote) return 0;
  const text = quote.replace(/^[ \t]*>[ \t]?/gmu, "").replaceAll("_", "").replace(/\s+/gu, " ").trim();
  return inboundIntroductions.has(text) ? quote.length : 0;
}

function routedDate(raw: string): string | undefined {
  const field = /^- _Routed from:_[^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*/mu.exec(maskComments(raw))?.[0];
  return field?.match(/\b\d{4}-\d{2}-\d{2}\b/u)?.[0];
}

function appendInbound(registry: Registry, records: ImportRecord[], source: ImportRecord, raw: string, report: MigrateReport): boolean {
  const reference = RecordReferenceSchema.parse({ kind: "work-item/inbound", owner: source.reference.owner });
  const grammar = registry[reference.kind].entry;
  const section = grammar?.sections[0];
  if (!grammar || !section) { reportImportGrammar(report, reference); return false; }
  let inbound = records.find(record => record.reference.kind === "work-item/inbound" && record.reference.owner.name === reference.owner.name);
  if (!inbound) { inbound = { reference, content: "# Inbound\n\n", placement: source.placement }; records.push(inbound); }
  const heading = raw.split("\n")[0] ?? "";
  const adapted = grammar.shape === "heading" ? raw : raw.replace(heading, `**${heading.replace(/^###\s*(?:\*\*)?|\*\*$/gu, "")}:**`);
  inbound.content = appendEntry(inbound.content, section, adapted);
  return true;
}
