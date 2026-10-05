/** Complete tracked listings, retaining malformed records as explicit diagnostics. */
import { SlugSchema } from "../../kernel/schema/slug.js";
import { admitTrackedOwner } from "./tracked-identity.js";
import { digestBytes } from "../../kernel/canonical/canonical-json.js";
import { OwnerIdentitySchema, RecordVersionSchema, RecordReferenceSchema, recordReferences, sameOwner, type RecordReference } from "../identity.js";
import type { KindId } from "../catalog.js";
import type { ListInput, ListingOutcome, ListingDiagnostic, StoreRecord } from "../read.js";
import type { InRepoContext } from "./context.js";
import { composedMetas, composedMetaSource, heldMetaSources, type MetaSource } from "./meta.js";
import { cohortPaths, internalReferences, companionNames, recordPath, invalidTrackedCoordinate } from "./paths.js";
import { readFileAt } from "./files.js";
import { decodeTrackedContent } from "./read-codec.js";
import { basename } from "node:path";
import { composedMetaFailures } from "./composition-quality.js";

/** Discover raw tracked references without requiring successful field parsing.
 * @param context - Backend dependencies and registered physical homes.
 * @param revision - Exact saved tree to enumerate.
 * @returns Every present addressable tracked record; incomplete acquisition throws.
 */
export async function trackedReferences(context:InRepoContext,revision:NonNullable<ListInput["asOf"]>): Promise<RecordReference[]> {
  const references: RecordReference[] = [];
  const acquisition: ListingDiagnostic[] = [];
  for (const definition of Object.values(context.registry)) {
    if (definition.inRepo.substrate !== "tracked") continue;
    const input = {family:definition.family,kind:definition.id,asOf:revision};
    for (const source of await kindSources(context,definition.id,input,acquisition,true)) {
      if (await readFileAt(context,source.path,revision) !== null) references.push(source.reference);
    }
  }
  if (acquisition.length > 0) throw new Error(acquisition.map((diagnostic)=>diagnostic.condition).join("; "));
  return references;
}

/** Enumerate tracked records by logical family and role.
 * @param context - Backend dependencies.
 * @param input - Logical family, role, owner, locations, and optional saved tree.
 * @returns Complete records and diagnostics, or established absence.
 */
export async function listTracked(context: InRepoContext, input: ListInput): Promise<ListingOutcome> {
  if (input.owner !== undefined) admitTrackedOwner(input.owner);
  if (input.kind === "work-item/meta") return listMetas(context, input);
  const kinds = input.kind === undefined ? Object.values(context.registry)
    .filter((kind) => kind.family === input.family && kind.inRepo.substrate === "tracked").map((kind) => kind.id) : [input.kind];
  const records: StoreRecord[] = [];
  const diagnostics: ListingDiagnostic[] = [];
  const acquisition: ListingDiagnostic[] = [];
  for (const kind of kinds) {
    for (const source of await kindSources(context, kind, input, acquisition)) {
      if (input.owner !== undefined && !sameOwner(source.reference.owner, input.owner)) continue;
      const value = await listedRecord(context, source, input);
      if (value === undefined) continue;
      if ("reference" in value) records.push(value); else diagnostics.push(value);
    }
  }
  return listing(records, diagnostics, input, acquisition);
}
async function listedRecord(context: InRepoContext, source: KindSource, input: ListInput): Promise<StoreRecord | ListingDiagnostic | undefined> {
  const kind = source.reference.kind;
  const content = await listingContent(context, source, input);
  if (content === null) return undefined;
  if (typeof content !== "string") return content;
  const decoded = await decodeTrackedContent(kind, content);
  if (decoded.error !== undefined || (decoded.key !== undefined && decoded.key !== source.reference.owner.name)) {
    return { kind: decoded.error === undefined ? "key-mismatch" : "malformed", key: source.path,
      condition: decoded.error ?? `Stored record names ${decoded.key} instead of ${source.reference.owner.name}`,
      remedy: { text: `Repair ${source.path}, then list the records again.` } };
  }
  const placement = source.meta?.placement ?? (kind.startsWith("review/") ? { kind: "active" as const } : undefined);
  if (kind.startsWith("work-item/") && placement === undefined) return invalidCompanionPlacement(source.path);
  return { reference: source.reference, content, version: RecordVersionSchema.parse(digestBytes(Buffer.from(content))),
    formatVersion: 1, conflicts: [], ...(placement === undefined ? {} : { placement }),
    ...(decoded.fields === undefined ? {} : { fields: decoded.fields }) };
}
async function listingContent(context: InRepoContext, source: KindSource, input: ListInput): Promise<string | null | ListingDiagnostic> {
  try { return await readFileAt(context, source.path, input.asOf ?? source.revision); } catch (error) {
    const code = error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code !== "EACCES" && code !== "EPERM") throw error;
    return { kind: "unreadable", key: source.path, condition: `The record could not be read: ${source.path}`,
      remedy: { text: `Restore read access to ${source.path}, then list the records again.` } };
  }
}
function listing(records: StoreRecord[], diagnostics: ListingDiagnostic[], input: ListInput, acquisition: ListingDiagnostic[]): ListingOutcome {
  const failures = [...new Map(acquisition.map((item) => [item.key, item])).values()];
  if (records.length === 0 && diagnostics.length === 0 && failures.length > 0
    && failures.every((failure) => failure.kind === "unreadable")) {
    return { status: "unreadable", condition: failures.map((item) => item.condition).join("; "),
      remedy: { text: failures.map((item) => item.remedy.text).join("; ") } };
  }
  diagnostics.push(...failures);
  const asOf = input.asOf === undefined ? {} : { asOf: input.asOf };
  return records.length === 0 && diagnostics.length === 0 ? { status: "absent", ...asOf }
    : { status: "complete", records, diagnostics, missed: diagnostics.length > 0, ...asOf };
}
async function listMetas(context: InRepoContext, input: ListInput): Promise<ListingOutcome> {
  const acquisition: ListingDiagnostic[] = [];
  const sources = await metaListingSources(context, input, acquisition);
  const records: StoreRecord[] = [];
  const diagnostics: ListingDiagnostic[] = [];
  for (const source of sources) {
    if (input.owner !== undefined && SlugSchema.safeParse(source.slug).success
      && !sameOwner(OwnerIdentitySchema.parse({ type: "work-item", name: source.slug }), input.owner)) continue;
    const diagnostic = metaDiagnostic(source);
    if (diagnostic !== undefined) { diagnostics.push(diagnostic); continue; }
    const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: source.slug }));
    records.push({ reference, content: source.content ?? "", fields: source.fields, placement: source.placement,
      version: RecordVersionSchema.parse(digestBytes(Buffer.from(source.content ?? ""))), formatVersion: 1, conflicts: [] });
  }
  return listing(records, diagnostics, input, acquisition);
}
interface KindSource { reference: RecordReference; path: string; meta?: MetaSource; revision?: string }
async function kindSources(context: InRepoContext, kind: KindId, input: ListInput, acquisition: ListingDiagnostic[], strictOwner = false): Promise<KindSource[]> {
  if (kind.startsWith("review/")) return reviewSources(context,kind,input,acquisition);
  if (kind === "lineage/transition") return internalReferences(context, kind, input.asOf, acquisition);
  if (kind === "project-inbox/inbox") {
    const reference = recordReferences[kind](input.owner ?? OwnerIdentitySchema.parse({ type: "project", name: "project" }));
    return [{ reference, path: await recordPath(context, reference) }];
  }
  if (kind === "cohort/document") return (await cohortPaths(context, input.asOf, acquisition)).flatMap((path) => {
    const slug = SlugSchema.safeParse(/^cohort-(.*)\.md$/u.exec(basename(path))?.[1]);
    if (!slug.success) { acquisition.push(invalidTrackedCoordinate(path)); return []; }
    return [{ path, reference: recordReferences[kind](OwnerIdentitySchema.parse({ type: "cohort", name: slug.data })) }];
  });
  if (!kind.startsWith("work-item/")) return [];
  return workItemSources(context, kind, input, acquisition, strictOwner);
}
async function workItemSources(context: InRepoContext, kind: KindId, input: ListInput, acquisition: ListingDiagnostic[], strictOwner: boolean): Promise<KindSource[]> {
  const sources: KindSource[] = [];
  for (const meta of await metaListingSources(context, input, acquisition)) {
    const owner = OwnerIdentitySchema.safeParse({ type: "work-item", name: meta.slug });
    if (!owner.success) {
      if (strictOwner) throw new Error(`The tracked meta filename cannot be addressed: ${meta.path}`);
      acquisition.push(invalidTrackedCoordinate(meta.path));
      continue;
    }
    if (input.owner !== undefined && !sameOwner(owner.data, input.owner)) continue;
    if (meta.placement === undefined) {
      acquisition.push(invalidCompanionPlacement(meta.path, meta));
      continue;
    }
    const keys = kind === "work-item/companion" ? await companionNames(context, meta, acquisition) : [undefined];
    for (const key of keys) {
      const reference = RecordReferenceSchema.parse({ kind, owner: owner.data, ...(key === undefined ? {} : { key }) });
      sources.push({ reference, meta, revision:meta.revision, path: await recordPath(context, reference, meta) });
    }
  }
  return sources;
}
async function reviewSources(context: InRepoContext, kind: KindId, input: ListInput, acquisition: ListingDiagnostic[]): Promise<KindSource[]> {
  const metas = await metaListingSources(context,{...input,filter:input.filter?.heldHere === true ? {heldHere:true} : undefined}, acquisition);
  const owners = new Map(metas.map((meta)=>[meta.slug,meta]));
  const sources = await internalReferences(context,kind,input.asOf,acquisition);
  return sources.flatMap((source)=> {
    const meta = owners.get(source.reference.owner.name);
    if (input.filter?.heldHere === true && meta === undefined) return [];
    const location = meta?.location ?? "active";
    if (input.filter?.locations !== undefined && !input.filter.locations.includes(location)) return [];
    return [{...source,...(meta === undefined ? {} : {meta})}];
  });
}
async function metaListingSources(context: InRepoContext, input: ListInput, acquisition: ListingDiagnostic[]): Promise<MetaSource[]> {
  const held = await heldMetaSources(context, input.asOf, input.filter?.heldHere === true ? input.filter.locations : undefined, acquisition);
  if (input.asOf !== undefined || input.filter?.heldHere === true) return filterLocations(held, input);
  const composition = await composedMetas(context, acquisition);
  const authoritative = new Set(held.filter((source) => source.location === "active").map((source) => source.slug));
  const failures = composedMetaFailures(composition, authoritative);
  acquisition.push(...failures.filter((failure) => failureMatchesOwner(failure.slug, input.owner))
    .map((failure) => failure.diagnostic));
  const unavailable = new Set(failures.flatMap((failure) => failure.slug === undefined ? [] : [failure.slug]));
  const sources = new Map<string, MetaSource>();
  for (const slug of composition.recordsBySlug.keys()) {
    if (authoritative.has(slug) || unavailable.has(slug)) continue;
    const source = await composedMetaSource(context, slug, composition);
    if (source !== undefined) sources.set(slug, source);
  }
  for (const source of held.filter((source) => source.location === "active" || !unavailable.has(source.slug))) {
    if (source.location === "active" || !sources.has(source.slug)) sources.set(source.slug || source.path, source);
  }
  return filterLocations([...sources.values()], input);
}
function failureMatchesOwner(slug: string | undefined, owner: ListInput["owner"]): boolean {
  const parsed = SlugSchema.safeParse(slug);
  return owner === undefined || !parsed.success
    || sameOwner(OwnerIdentitySchema.parse({ type: "work-item", name: parsed.data }), owner);
}
function filterLocations(sources: MetaSource[], input: ListInput): MetaSource[] {
  return sources.filter((source) => input.filter?.locations === undefined || input.filter.locations.includes(source.location));
}
function metaDiagnostic(source: MetaSource): ListingDiagnostic | undefined {
  let condition: string | undefined;
  if (!SlugSchema.safeParse(source.slug).success) condition = "The meta filename carries an invalid work-unit slug";
  else if (source.content === null) condition = "The meta file could not be read";
  else if (source.fields === undefined) condition = "The meta parser rejects the record's content";
  else if (source.placement === undefined) condition = "The layout cannot place this meta path";
  if (condition === undefined) return undefined;
  return { kind: source.content === null ? "unreadable" : "malformed", key: source.path,
    ...(source.content !== null && source.fields !== undefined && SlugSchema.safeParse(source.slug).success
      && source.placement === undefined ? { rule: "placement" as const } : {}),
    condition: `${condition}: ${source.path}`, remedy: { text: `Repair ${source.path}, then list the records again.` } };
}

function invalidCompanionPlacement(path: string, meta?: MetaSource): ListingDiagnostic {
  const diagnostic = meta === undefined ? undefined : metaDiagnostic(meta);
  if (diagnostic !== undefined) return diagnostic;
  return { kind: "malformed", rule: "placement", key: path, condition: `The layout cannot place this companion's meta: ${path}`,
    remedy: { text: `Repair the meta placement at ${path}, then list the records again.` } };
}
