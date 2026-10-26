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
import { importCohortPlacements } from "./cohort-source.js";
import { readImportCandidateVersions } from "./candidate.js";
import { appendImportLineage } from "./lineage.js";
import type { Slug } from "../../../kernel/schema/slug.js";
import { appendImportTransients, type ImportTransientState } from "./transient.js";
import { moveImportPendingEntries } from "./pending-entries.js";
import { appendImportPersonal } from "./personal.js";
import type { Links } from "../../links.js";
import { readImportParkedSources, isParkedSourceDiagnostic, type ParkedImportSources } from "./parked-source.js";

/** One imported content revision and its containing owner's lifecycle placement. */
export interface ImportRecord { reference: RecordReference; content: string; placement?: StoreRecord["placement"]; asFound?: boolean;
  formerSlugs?: Slug[]; links?: Links; personalPath?: string; mappedVersions?: string[] }
/** Committed Candidate evidence is independent of whether a current source file exists. */
export interface ImportCandidateSource { reference: RecordReference; current: string | null; versions: { commit: string; content: string }[] }
/** Current files and independently acquired Candidate histories share the same imported owner identities. */
export interface ImportSource { records: ImportRecord[]; candidates: ImportCandidateSource[] }
/** All source content is acquired before a destination object or ref is published. */
export async function readImportSource(context: RefBackendContext, report: MigrateReport, codeHead: string, transients: ImportTransientState): Promise<ImportSource> {
  const source = context.importSource;
  if (!source) throw new Error("The store composition point did not bind the import source");
  const result: ImportRecord[] = [];
  const candidates: ImportCandidateSource[] = [];
  const owners = new Map<string, string>();
  const internal: InRepoContext = { ports: source.ports, registry: context.registry };
  const parked = await readImportParkedSources(context, internal, report, codeHead);
  const composition = await composedMetas(internal);
  const metas = await source.store.list({ family: "work-item", kind: "work-item/meta" });
  if (metas.status !== "ok") { report.notices.push({ condition: metas.refusal.condition, remedy: metas.refusal.remedy }); return { records: result, candidates }; }
  if (metas.result.status === "complete") {
    report.notices.push(...metas.result.diagnostics.filter(item => !isParkedSourceDiagnostic(item, parked.names))
      .map(({ condition, remedy }) => ({ condition, remedy })));
    for (const meta of metas.result.records.filter(meta => !parked.names.has(meta.reference.owner.name))) {
      await appendWorkItem(context, report, result, owners, internal, composition, meta, candidates);
    }
  } else if (metas.result.status === "unreadable") report.notices.push({ condition: metas.result.condition, remedy: metas.result.remedy });
  for (const kind of Object.values(context.registry).filter((definition) => definition.family === "work-item"
    && definition.id !== "work-item/meta" && definition.inRepo.substrate === "tracked")) {
    await appendListing(context, report, result, owners, kind.id, undefined, undefined, parked.names);
  }
  await appendParkedWork(context, report, result, owners, internal, composition, parked, candidates);
  const head = StateVersionSchema.parse((await source.ports.exec("git", ["rev-parse", `${codeHead}^{tree}`], { cwd: source.ports.checkoutRoot })).stdout.trim());
  await appendListing(context, report, result, owners, "cohort/document", undefined, head);
  await appendListing(context, report, result, owners, "project-inbox/inbox", undefined, head);
  await appendImportLineage(context, report, result, owners, head);
  await appendImportPersonal(context, report, result);
  await appendImportTransients(context, report, result, transients);
  moveImportPendingEntries(context.registry, result, report);
  const refs = new Set(result.flatMap(({ reference, placement }) => placement?.kind === "completed"
    ? [expandStoredPath(reference, { registry: context.registry, placement }).ref, expandStoredPath(reference, { registry: context.registry, history: true }).ref]
    : reference.kind === "lineage/transition" ? [expandStoredPath(reference, { registry: context.registry }).ref,
      expandStoredPath(RecordReferenceSchema.parse({ ...reference, kind: "work-item/meta" }), { registry: context.registry, history: true }).ref]
    : [expandStoredPath(reference, { registry: context.registry }).ref]));
  for (const ref of refs) {
    const person = /^refs\/arc\/user\/([^/]+)\//u.exec(ref)?.[1];
    report.refs.push({ ref, scope: person ? "identity" : "project", ...(person ? { person } : {}), action: "create" });
  }
  return { records: result, candidates };
}

async function appendWorkItem(context: RefBackendContext, report: MigrateReport, result: ImportRecord[], owners: Map<string, string>,
  internal: InRepoContext, composition: Awaited<ReturnType<typeof composedMetas>>, meta: StoreRecord,
  candidates: ImportCandidateSource[], pinnedRevision?: string): Promise<void> {
  const source = internal.ports;
  const bound = bindOwner(meta, owners);
  result.push(bound);
  const selected = pinnedRevision === undefined ? await composedMetaSource(internal, meta.reference.owner.name, composition) : undefined;
  const revision = pinnedRevision ?? selected?.revision;
  const asOf = revision === undefined ? undefined : StateVersionSchema.parse((await source.exec("git",
    ["rev-parse", `${revision}^{tree}`], { cwd: source.checkoutRoot })).stdout.trim());
  for (const kind of ["review/candidate", "review/integration-boundary"] as const) {
    await appendListing(context, report, result, owners, kind, meta.reference.owner, asOf);
  }
  const candidate = result.find(({ reference }) => reference.kind === "review/candidate" && reference.owner.name === meta.reference.owner.name);
  const versions = await readImportCandidateVersions(context, meta.reference.owner.name, revision);
  candidates.push({ reference: RecordReferenceSchema.parse({ kind: "review/candidate", owner: bound.reference.owner }),
    current: candidate?.content ?? null, versions });
  if (candidate) await inspectCandidateChain(context, candidate, revision, report);
}

async function appendParkedWork(context: RefBackendContext, report: MigrateReport, records: ImportRecord[], owners: Map<string, string>,
  internal: InRepoContext, composition: Awaited<ReturnType<typeof composedMetas>>, parked: ParkedImportSources,
  candidates: ImportCandidateSource[]): Promise<void> {
  for (const { meta, revision, asOf } of parked.available) {
    await appendWorkItem(context, report, records, owners, internal, composition, meta, candidates, revision);
    for (const kind of Object.values(context.registry).filter(definition => definition.family === "work-item"
      && definition.id !== "work-item/meta" && definition.inRepo.substrate === "tracked")) {
      await appendListing(context, report, records, owners, kind.id, meta.reference.owner, asOf);
    }
  }
}

async function appendListing(context: RefBackendContext, report: MigrateReport, result: ImportRecord[], owners: Map<string, string>,
  kind: KindId, owner?: RecordReference["owner"], asOf?: ReturnType<typeof StateVersionSchema.parse>, ignoredOwners?: ReadonlySet<string>): Promise<void> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  const listing = await source.store.list({ family: context.registry[kind].family, kind, owner, asOf });
  if (listing.status !== "ok") { report.notices.push({ condition: listing.refusal.condition, remedy: listing.refusal.remedy }); return; }
  if (listing.result.status === "complete") {
    const asFound = kind === "review/candidate" || kind === "review/integration-boundary";
    const placements = kind === "cohort/document" ? await importCohortPlacements(context, report, asOf) : new Map<string, StoreRecord["placement"]>();
    result.push(...listing.result.records.filter(record => !ignoredOwners?.has(record.reference.owner.name)).map((record) => ({ ...bindOwner(record, owners), asFound,
      placement: placements.get(record.reference.owner.name) ?? record.placement })));
    await appendDiagnostics(context, report, result, owners, kind,
      listing.result.diagnostics.filter(item => !ignoredOwners || !isParkedSourceDiagnostic(item, ignoredOwners)), owner, asOf);
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
