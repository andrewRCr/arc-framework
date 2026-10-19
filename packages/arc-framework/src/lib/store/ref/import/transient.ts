/** Acquire the configured identity's pinned transient records for re-homing. */
import { randomUUID } from "node:crypto";
import type { RefBackendContext } from "../context.js";
import type { ImportRecord } from "./source.js";
import type { MigrateReport } from "../../commands.js";
import { readTransientIdentitySnapshot } from "../../../errand/identity-snapshot.js";
import { serializeTransientIdentityRecord, type TransientIdentityRecord } from "../../../errand/identity-record.js";
import { transientIO, transientKind, transientReference } from "../../in-repo/transient-common.js";
import { RecordReferenceSchema, type RecordReference } from "../../identity.js";
import { errandsRef } from "../../../errand/ref-tree.js";
import { rejoinEntryList, splitEntryList } from "../../concurrency/entries.js";
import { matchInboxEntryTitle } from "../../kinds/entry-fields.js";
import { inboxEntrySourceDigest } from "../../../user-sync/inbox-writer.js";
import { SlugSchema } from "../../../kernel/schema/slug.js";
import { readSyncRefs } from "../sync-graph.js";

/** Source retirement leases and informational observations that do not block admission. */
export interface ImportTransientState { tips: Map<string, string>; notices: MigrateReport["notices"] }

/** Read one immutable source tree and retain its exact retirement lease. */
export async function appendImportTransients(context: RefBackendContext, report: MigrateReport, records: ImportRecord[], state: ImportTransientState): Promise<void> {
  if (!context.importSource) throw new Error("No import source bound");
  const io = await transientIO({ ports: context.importSource.ports, registry: context.registry });
  await reportOtherIdentities(context, io?.identity, state);
  if (!io) return;
  const snapshot = await readTransientIdentitySnapshot(io);
  if (snapshot.kind === "absent") return;
  const remedy = { text: "Repair the configured identity's transient ref, then retry arc store migrate --import." };
  if (snapshot.kind === "error") { report.notices.push({ condition: snapshot.message, remedy }); return; }
  if (snapshot.diagnostics.length) {
    report.notices.push(...snapshot.diagnostics.map((item) => ({ condition: `${item.key}: ${item.kind}`, remedy })));
    return;
  }
  state.tips.set(errandsRef(io.identity), snapshot.tip);
  for (const [key, record] of snapshot.records) appendTransientRecord(context, report, records, state, io.identity, key, record);
}

async function reportOtherIdentities(context: RefBackendContext, identity: string | undefined, state: ImportTransientState): Promise<void> {
  const otherRefs = [...await readSyncRefs(context, "refs/arc/user/")].map(([ref]) => ref)
    .filter((ref) => /^refs\/arc\/user\/[^/]+\/errands$/u.test(ref) && ref !== (identity ? errandsRef(identity) : undefined));
  state.notices.push(...otherRefs.map((ref) => ({ condition: `${ref} belongs to another identity and was left in place.`,
    remedy: { text: "Import that identity's transient records from its configured checkout before retiring the legacy ref." } })));
}

function appendTransientRecord(context: RefBackendContext, report: MigrateReport, records: ImportRecord[], state: ImportTransientState,
  identity: string, key: string, record: TransientIdentityRecord): void {
  const kind = transientKind(record);
  const original = transientReference(kind, key, identity);
  const reference = kind === "work-item/record" ? RecordReferenceSchema.parse({ ...original,
    owner: { ...original.owner, uid: randomUUID() } }) : original;
  records.push({ reference, content: serializeTransientIdentityRecord(record.kind === "errand" && record.purpose === "errand"
    ? { ...record, owner: SlugSchema.parse(identity) } : record), ...(kind === "work-item/record" ? { placement: { kind: "active" as const } } : {}) });
  if (record.kind === "errand" && record.purpose === "errand") {
    const bytes = record.origin === "inbox" ? takeOrigin(context, records, identity, record.originEntry, record.originEntrySourceDigest, state) : undefined;
    appendDescription(context, report, records, reference, bytes, record.intent);
  }
}

function appendDescription(context: RefBackendContext, report: MigrateReport, records: ImportRecord[], reference: RecordReference,
  bytes: string | undefined, intent: string): void {
  const entry = context.registry["work-item/description"].entry;
  if (!entry?.sections[0]) { report.notices.push({ condition: "work-item/description has no declared entry grammar." }); return; }
  const title = reference.owner.name;
  const body = bytes ?? `${entry.shape === "heading" ? `### **${title}**` : `**${title}:**`}\n\n${intent}`;
  records.push({ reference: RecordReferenceSchema.parse({ ...reference, kind: "work-item/description" }),
    content: `# ${title}\n\n## ${entry.sections[0]}\n\n${body}\n` });
}

function takeOrigin(context: RefBackendContext, records: ImportRecord[], person: string, title: string, digest: string | null,
  state: ImportTransientState): string | undefined {
  const inbox = records.find(({ reference }) => reference.kind === "personal/inbox" && reference.owner.name === person);
  const grammar = context.registry["personal/inbox"].entry;
  if (!inbox || !grammar) return;
  const split = splitEntryList(inbox.content, grammar);
  const matches = split.parts.filter((part) => part.kind === "entry" && matchInboxEntryTitle(part.bytes.split("\n")[0] ?? "") === title);
  if (matches.length === 0) return;
  if (matches.length !== 1) throw new Error(`Duplicate Errand origin entry: ${title}`);
  const selected = matches[0];
  if (!selected) return;
  if (digest !== null && inboxEntrySourceDigest(inbox.content, title) !== digest) state.notices.push({
    condition: `Errand origin entry '${title}' changed since adoption; its current content was moved into the description.` });
  inbox.content = rejoinEntryList({ parts: split.parts.filter((part) => part !== selected) });
  return selected.bytes;
}
