/** Re-home pending captures into imported queues and work-item inbound lists. */
import type { RefBackendContext } from "../context.js";
import type { ImportRecord } from "./source.js";
import type { MigrateReport } from "../../commands.js";
import { listExecuteBoundInboxEntries } from "../../../user-sync/inbox-writer.js";
import { prepareRefPut } from "../prepare-content.js";
import { splitEntryList, type ListEntry } from "../../concurrency/entries.js";
import { matchInboxEntryTitle, writeEntryFields } from "../../kinds/entry-fields.js";
import { RecordReferenceSchema } from "../../identity.js";
import { generateRankBetween } from "../../concurrency/rank.js";
import { reportImportAdmission, reportImportPutFailure, reportImportGrammar } from "./admission.js";
import { importInboundEntries } from "./inbound-entries.js";

/** Move pending source entries before generic identity stamping. */
export function moveImportPendingEntries(registry: RefBackendContext["registry"], records: ImportRecord[], report: MigrateReport): void {
  const inboxes = records.filter(record => record.reference.kind === "personal/inbox");
  const diagnostics = inboxes.flatMap(inbox => listExecuteBoundInboxEntries(inbox.content).diagnostics);
  report.notices.push(...diagnostics.map(condition => ({ condition,
    remedy: { text: "Repair the named inbox disposition, then retry arc store migrate --import." } })));
  if (diagnostics.length) return;
  importInboundEntries(registry, records, report);
  for (const inbox of inboxes) importQueue(registry, records, inbox, report);
}

function importQueue(registry: RefBackendContext["registry"], records: ImportRecord[], inbox: ImportRecord, report: MigrateReport): void {
  const listing = listExecuteBoundInboxEntries(inbox.content);
  if (!listing.entries.length) return;
  const grammar = registry["personal/inbox"].entry;
  if (!grammar) { reportImportGrammar(report, inbox.reference); return; }
  const titles = new Set(listing.entries.map(entry => entry.title));
  const split = splitEntryList(inbox.content, grammar);
  const clean = split.parts.map(part => part.kind === "entry" && titles.has(entryTitle(part))
    ? { ...part, bytes: part.bytes.replace(/\r?\n- _Disposition:_ `execute-bound`\r?\n/u, "") } : part);
  const prepared = prepareRefPut(inbox.reference, null, clean.map(part => part.bytes + (part.kind === "entry" ? part.separator : "")).join(""), registry);
  if (prepared.status === "refused") { reportImportPutFailure(registry, report, inbox, prepared.refusal); return; }
  inbox.content = prepared.result;
  const selected = splitEntryList(inbox.content, grammar).parts.filter((part): part is ListEntry => part.kind === "entry" && titles.has(entryTitle(part)));
  if (selected.length !== listing.entries.length || selected.some(part => part.id === undefined)) {
    reportImportAdmission(report, inbox, {
      condition: `Cannot stamp every execute-bound entry in ${inbox.reference.kind}: expected ${listing.entries.length} entries and selected ${selected.length}, including ${selected.filter(part => part.id === undefined).length} without IDs.`,
      remedy: { text: "Correct the pending entry headings to match the declared entry grammar and give each entry a unique ID or leave it unstamped, then retry arc store migrate --import." },
    }, "entry-id");
    return;
  }
  const reference = RecordReferenceSchema.parse({ kind: "personal/errand-queue", owner: inbox.reference.owner });
  const config = registry[reference.kind].entry;
  if (!config?.sections[0]) { reportImportGrammar(report, reference); return; }
  let rank: string | null = null;
  const members = selected.map(part => {
    rank = generateRankBetween(rank, null);
    const title = entryTitle(part);
    const heading = config.shape === "heading" ? `### **${title}**` : `**${title}:**`;
    return writeEntryFields(heading, { Id: part.id, Inbox: "personal", Rank: rank });
  });
  records.push({ reference, content: `# Errand Queue\n\n## ${config.sections[0]}\n\n${members.join("\n\n")}\n` });
}

function entryTitle(entry: ListEntry): string { return matchInboxEntryTitle(entry.bytes.split("\n")[0] ?? "") ?? ""; }
