/** Read live tracked records through the in-repository store at their selected revisions. */
import { randomUUID } from "node:crypto";
import type { RefBackendContext } from "../context.js";
import { RecordReferenceSchema, StateVersionSchema, type RecordReference } from "../../identity.js";
import type { StoreRecord } from "../../read.js";
import type { MigrateReport } from "../../commands.js";
import type { InRepoContext } from "../../in-repo/context.js";
import { composedMetas, composedMetaSource } from "../../in-repo/meta.js";
import type { KindId } from "../../catalog.js";
import { expandStoredPath } from "../../stored-path.js";
import { internalReferences } from "../../in-repo/paths.js";
import { inspectCandidateChain } from "./review.js";

/** One imported content revision and its containing owner's lifecycle placement. */
export interface ImportRecord { reference: RecordReference; content: string; placement?: StoreRecord["placement"]; asFound?: boolean }
/** All source content is acquired before a destination object or ref is published. */
export async function readImportSource(context: RefBackendContext, report: MigrateReport, codeHead: string): Promise<ImportRecord[]> {
  const source = context.importSource;
  if (!source) throw new Error("The store composition point did not bind the import source");
  const result: ImportRecord[] = [];
  const owners = new Map<string, string>();
  const internal: InRepoContext = { ports: source.ports, registry: context.registry };
  const composition = await composedMetas(internal);
  const metas = await source.store.list({ family: "work-item", kind: "work-item/meta", filter: { locations: ["active", "planned", "provisional"] } });
  if (metas.status !== "ok") { report.notices.push({ condition: metas.refusal.condition, remedy: metas.refusal.remedy }); return result; }
  if (metas.result.status === "complete") {
    report.notices.push(...metas.result.diagnostics.map(({ condition, remedy }) => ({ condition, remedy })));
    for (const meta of metas.result.records) await appendWorkItem(context, report, result, owners, internal, composition, meta);
  } else if (metas.result.status === "unreadable") report.notices.push({ condition: metas.result.condition, remedy: metas.result.remedy });
  const head = StateVersionSchema.parse((await source.ports.exec("git", ["rev-parse", `${codeHead}^{tree}`], { cwd: source.ports.checkoutRoot })).stdout.trim());
  await appendListing(context, report, result, owners, "cohort/document", undefined, head);
  await appendListing(context, report, result, owners, "project-inbox/inbox", undefined, head);
  await appendPersonal(context, report, result);
  for (const ref of new Set(result.map(({ reference }) => expandStoredPath(reference, { registry: context.registry }).ref))) {
    const person = /^refs\/arc\/user\/([^/]+)\//u.exec(ref)?.[1];
    report.refs.push({ ref, scope: person ? "identity" : "project", ...(person ? { person } : {}), action: "create" });
  }
  return result;
}

async function appendWorkItem(context: RefBackendContext, report: MigrateReport, result: ImportRecord[], owners: Map<string, string>,
  internal: InRepoContext, composition: Awaited<ReturnType<typeof composedMetas>>, meta: StoreRecord): Promise<void> {
  const source = internal.ports;
  result.push(bindOwner(meta, owners));
  const selected = await composedMetaSource(internal, meta.reference.owner.name, composition);
  const asOf = selected?.revision === undefined ? undefined : StateVersionSchema.parse((await source.exec("git",
    ["rev-parse", `${selected.revision}^{tree}`], { cwd: source.checkoutRoot })).stdout.trim());
  for (const kind of Object.values(context.registry).filter((definition) => definition.family === "work-item"
    && definition.id !== "work-item/meta" && definition.inRepo.substrate === "tracked")) {
    await appendListing(context, report, result, owners, kind.id, meta.reference.owner);
  }
  for (const kind of ["review/candidate", "review/integration-boundary"] as const) {
    await appendListing(context, report, result, owners, kind, meta.reference.owner, asOf);
  }
  const candidate = result.find(({ reference }) => reference.kind === "review/candidate" && reference.owner.name === meta.reference.owner.name);
  if (candidate) await inspectCandidateChain(context, candidate, selected?.revision, report);
}

async function appendPersonal(context: RefBackendContext, report: MigrateReport, records: ImportRecord[]): Promise<void> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  const listed = await source.store.list({ family: "personal" });
  if (listed.status === "refused") { report.notices.push({ condition: listed.refusal.condition, remedy: listed.refusal.remedy }); return; }
  if (listed.result.status === "unreadable") { report.notices.push({ condition: listed.result.condition, remedy: listed.result.remedy }); return; }
  if (listed.result.status !== "complete") return;
  report.notices.push(...listed.result.diagnostics.map(({ condition, remedy }) => ({ condition, remedy })));
  for (const record of listed.result.records) {
    if (record.reference.kind === "personal/session-context") continue;
    const reference = record.reference.kind === "personal/document" && typeof record.reference.key === "string" ? RecordReferenceSchema.parse({ ...record.reference,
      key: `scratch/${record.reference.key}` }) : record.reference;
    records.push({ ...record, reference });
  }
}

async function appendListing(context: RefBackendContext, report: MigrateReport, result: ImportRecord[], owners: Map<string, string>,
  kind: KindId, owner?: RecordReference["owner"], asOf?: ReturnType<typeof StateVersionSchema.parse>): Promise<void> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  const listing = await source.store.list({ family: context.registry[kind].family, kind, owner, asOf });
  if (listing.status !== "ok") { report.notices.push({ condition: listing.refusal.condition, remedy: listing.refusal.remedy }); return; }
  if (listing.result.status === "complete") {
    const asFound = kind === "review/candidate" || kind === "review/integration-boundary";
    result.push(...listing.result.records.map((record) => ({ ...bindOwner(record, owners), asFound })));
    await appendDiagnostics(context, report, result, owners, kind, listing.result.diagnostics, owner, asOf);
  } else if (listing.result.status === "unreadable") report.notices.push({ condition: listing.result.condition, remedy: listing.result.remedy });
}

async function appendDiagnostics(context: RefBackendContext, report: MigrateReport, result: ImportRecord[], owners: Map<string, string>,
  kind: KindId, diagnostics: import("../../read.js").ListingDiagnostic[], owner?: RecordReference["owner"], asOf?: ReturnType<typeof StateVersionSchema.parse>): Promise<void> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  const asFound = kind === "review/candidate" || kind === "review/integration-boundary";
  const paths = asFound ? await internalReferences({ ports: source.ports, registry: context.registry }, kind, asOf) : [];
  for (const diagnostic of diagnostics) {
    const matched = diagnostic.kind === "malformed" ? paths.find(({ reference, path }) => path === diagnostic.key
      && (owner === undefined || reference.owner.name === owner.name)) : undefined;
    const raw = matched ? await source.store.read({ reference: matched.reference, asOf }) : undefined;
    if (raw?.status === "ok") result.push({ ...bindOwner(raw.result, owners), asFound: true });
    else report.notices.push({ condition: diagnostic.condition, remedy: diagnostic.remedy });
  }
}

function bindOwner(record: StoreRecord, owners: Map<string, string>): ImportRecord {
  const owner = record.reference.owner;
  if (owner.type !== "work-item" && owner.type !== "cohort") return record;
  const key = `${owner.type}:${owner.name}`;
  let uid = owners.get(key);
  if (!uid) { uid = randomUUID(); owners.set(key, uid); }
  return { ...record, reference: RecordReferenceSchema.parse({ ...record.reference, owner: { ...owner, uid } }) };
}
