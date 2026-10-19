/** Resolve semantic list selectors to exact store records without projected paths. */
import { z } from "zod";
import { SlugSchema, WorkUnitStateSchema } from "../kernel/index.js";
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import { TransientIdentityRecordSchema } from "../errand/identity-record.js";
import { OwnerIdentitySchema, recordReferences, sameReference, type RecordReference } from "../store/identity.js";
import { ConflictRecordSchema } from "../store/conflict.js";
import type { StoreRecord } from "../store/read.js";
import type { EntryKind } from "../store/kinds/entry-configs.js";
import { failure, withProvenance } from "./refusals.js";
export { failure, withProvenance } from "./refusals.js";
import { retiredDestination } from "./retirement.js";
import type { InboxContext, InboxOutcome } from "./types.js";

/** List record and primary lifecycle evidence held at the caller's observed versions. */
export interface ResolvedEntryList {
  selector: string;
  reference: RecordReference;
  kind: EntryKind;
  saved: StoreRecord | null;
  primary: StoreRecord | null;
  owner: string | null;
  state: string | null;
  inbox: "personal" | "project" | null;
}
/** Resolve and read one supported list; only a not-found record means an empty list.
 * @param selector - Reserved inbox name, work-item slug, or generation UID.
 * @param context - Store and current identity.
 * @returns Exact records or complete refusal provenance.
 */
export async function resolveEntryList(selector: string, context: InboxContext): Promise<InboxOutcome<ResolvedEntryList>> {
  if (selector === "personal") {
    const owner = OwnerIdentitySchema.safeParse({ type: "person", name: context.identity });
    if (!owner.success) return failure("identity-missing", "A valid ARC identity is required.", "Configure your ARC identity, then retry.");
    return readList({ selector, reference: recordReferences["personal/inbox"](owner.data), kind: "personal/inbox", primary: null, owner: context.identity, state: null, inbox: "personal" }, context);
  }
  if (selector === "project") return projectList(context);
  return resolveWorkItemList(selector, context);
}

/** Resolve an explicit work-item subject independently of reserved inbox selectors.
 * @param selector - Work-item slug, former slug, or generation UID.
 * @param context - Store and current identity.
 * @returns Its inbound list or Errand description, with primary lifecycle evidence.
 */
export async function resolveWorkItemList(selector: string, context: InboxContext): Promise<InboxOutcome<ResolvedEntryList>> {
  const primary = await findPrimary(selector, context);
  if (primary.status === "refused") return primary;
  const value = primary.result;
  if (value.conflicts.length > 0) return failure("record-conflicted",
    `The work-item primary has unresolved conflicts: ${value.conflicts.map(reference => JSON.stringify(reference)).join(", ")}.`,
    "Resolve the named conflict records, then retry the entry command.");
  if (value.reference.kind === "work-item/meta") {
    const fields = ParsedMetaRecordSchema.safeParse(value.fields);
    if (!fields.success || !WorkUnitStateSchema.safeParse(fields.data.state).success) return failure("record-malformed", `Work unit ${selector} has no readable lifecycle fields.`, "Repair its metadata and retry.");
    return readList({ selector, reference: recordReferences["work-item/inbound"](value.reference.owner), kind: "work-item/inbound", primary: value, owner: fields.data.owner, state: fields.data.state, inbox: null }, context);
  }
  const fields = decodeErrand(value);
  if (fields === null) return failure("record-malformed", `Errand ${selector} has no readable identity.`, "Repair its identity record and retry.");
  return readList({ selector, reference: recordReferences["work-item/description"](value.reference.owner), kind: "work-item/description", primary: value, owner: fields.owner ?? null, state: fields.state, inbox: null }, context);
}

async function readList(list: Omit<ResolvedEntryList, "saved">, context: InboxContext): Promise<InboxOutcome<ResolvedEntryList>> {
  const read = await context.store.read({ reference: list.reference });
  if (read.status === "ok") return { status: "ok", result: { ...list, reference: read.result.reference, saved: read.result } };
  return read.refusal.code === "not-found" ? { status: "ok", result: { ...list, saved: null } } : { status: "refused", refusal: withProvenance(read.refusal) };
}

async function projectList(context: InboxContext): Promise<InboxOutcome<ResolvedEntryList>> {
  const listed = await context.store.list({ family: "project-inbox", kind: "project-inbox/inbox" });
  if (listed.status === "refused") return { status: "refused", refusal: withProvenance(listed.refusal) };
  const value = listed.result;
  if (value.status === "unreadable") return failure("observation-incomplete", value.condition, value.remedy.text, value);
  if (value.status === "complete" && (value.missed || value.diagnostics.length > 0)) return failure("observation-incomplete", value.diagnostics.map((d) => d.condition).join("; "), "Repair the project inbox diagnostics, then retry.");
  const records = value.status === "complete" ? value.records : [];
  if (records.length > 1) return failure("ambiguous-match", "More than one project inbox was listed.", "Repair the project inbox namespace, then retry.");
  const saved = records[0] ?? null;
  const reference = saved === null ? await absentProjectInboxReference(context) : { status: "ok" as const, result: saved.reference };
  if (reference.status === "refused") return reference;
  return { status: "ok", result: { selector: "project", reference: reference.result, saved, primary: null, kind: "project-inbox/inbox", owner: null, state: null, inbox: "project" } };
}

async function absentProjectInboxReference(context: InboxContext): Promise<InboxOutcome<RecordReference>> {
  const listed = await context.store.list({ family: "project-inbox", kind: "project-inbox/conflict-record" });
  if (listed.status === "refused") return { status: "refused", refusal: withProvenance(listed.refusal) };
  const value = listed.result;
  if (value.status === "unreadable") return failure("observation-incomplete", value.condition, value.remedy.text, value);
  if (value.status === "complete" && (value.missed || value.diagnostics.length > 0)) return failure("observation-incomplete",
    `Project inbox conflict listing is incomplete. ${value.diagnostics.map((diagnostic) => `${diagnostic.key}: ${diagnostic.condition} ${diagnostic.remedy.text}`).join(" ")}`, "Repair the project inbox conflict listing, then retry.", value);
  const subjects: RecordReference[] = [];
  for (const saved of value.status === "complete" ? value.records : []) {
    let conflict;
    try { conflict = ConflictRecordSchema.parse(JSON.parse(saved.content)); }
    catch { return failure("record-malformed", `Conflict evidence ${JSON.stringify(saved.reference)} is malformed.`, "Repair the named conflict record, then retry."); }
    if (conflict.record.kind === "project-inbox/inbox" && !subjects.some((reference) => sameReference(reference, conflict.record))) subjects.push(conflict.record);
  }
  if (subjects.length > 1) return failure("ambiguous-match", `More than one absent project inbox has unresolved conflicts: ${subjects.map((reference) => JSON.stringify(reference)).join(", ")}.`, "Resolve the conflicting project inbox generations, then retry.");
  return { status: "ok", result: subjects[0] ?? recordReferences["project-inbox/inbox"](OwnerIdentitySchema.parse({ type: "project", name: "project" })) };
}

async function findPrimary(selector: string, context: InboxContext): Promise<InboxOutcome<StoreRecord>> {
  if (z.uuid().safeParse(selector).success) return primaryByUid(selector, context);
  const slug = SlugSchema.safeParse(selector);
  if (!slug.success) return failure("invalid-input", `Invalid list selector ${selector}.`, "Name personal, project, a work-item slug, or its UID.");
  const found = await context.store.lookup({ kind: "slug", slug: slug.data });
  if (found.status === "refused") return found.refusal.code === "not-found" ? retiredDestination(slug.data, withProvenance(found.refusal), context) : { status: "refused", refusal: withProvenance(found.refusal) };
  const read = await context.store.read({ reference: found.result.reference });
  return read.status === "refused" ? { status: "refused", refusal: withProvenance(read.refusal) } : read;
}

async function primaryByUid(uid: string, context: InboxContext): Promise<InboxOutcome<StoreRecord>> {
  const records: StoreRecord[] = [];
  for (const kind of ["work-item/meta", "work-item/record"] as const) {
    const listed = await context.store.list({ family: "work-item", kind });
    if (listed.status === "refused") return { status: "refused", refusal: withProvenance(listed.refusal) };
    const value = listed.result;
    if (value.status === "unreadable") return failure("observation-incomplete", value.condition, value.remedy.text, value);
    if (value.status === "complete") {
      if (value.missed || value.diagnostics.length > 0) return failure("observation-incomplete", "Work-item UID lookup has incomplete evidence.", "Repair the listed work-item diagnostics, then retry.");
      records.push(...value.records.filter((record) => record.reference.owner.type !== "person" && record.reference.owner.uid === uid));
    }
  }
  if (records.length === 1 && records[0] !== undefined) return { status: "ok", result: records[0] };
  const absent = failure(records.length ? "ambiguous-match" : "not-found", `UID ${uid} does not select exactly one work item.`, "List the work-item generations and use the intended UID.");
  return records.length === 0 ? retiredDestination(uid, absent.refusal, context) : absent;
}

function decodeErrand(record: StoreRecord): { owner?: string; state: string } | null {
  try {
    const parsed = TransientIdentityRecordSchema.safeParse(JSON.parse(record.content));
    return parsed.success && parsed.data.kind === "errand" && parsed.data.purpose === "errand" ? parsed.data : null;
  } catch { return null; }
}
