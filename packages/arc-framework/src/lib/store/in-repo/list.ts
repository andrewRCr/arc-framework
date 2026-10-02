/** Complete tracked listings, retaining malformed records as explicit diagnostics. */
import { SlugSchema } from "../../kernel/schema/slug.js";
import { digestBytes } from "../../kernel/canonical/canonical-json.js";
import { OwnerIdentitySchema, RecordVersionSchema, RecordReferenceSchema, recordReferences, sameOwner, type RecordReference } from "../identity.js";
import type { KindId } from "../catalog.js";
import type { ListInput, ListingOutcome, ListingDiagnostic, StoreRecord } from "../read.js";
import type { InRepoContext } from "./context.js";
import { composedMetas, composedMetaSource, heldMetaSources, type MetaSource } from "./meta.js";
import { cohortPaths, internalReferences, companionNames, recordPath } from "./paths.js";
import { readFileAt } from "./files.js";
import { decodeTrackedContent } from "./read-codec.js";
import { basename } from "node:path";

/** Enumerate tracked records by logical family and role.
 * @param context - Backend dependencies.
 * @param input - Logical family, role, owner, locations, and optional saved tree.
 * @returns Complete records and diagnostics, or established absence.
 */
export async function listTracked(context: InRepoContext, input: ListInput): Promise<ListingOutcome> {
  if (input.kind === "work-item/meta") return listMetas(context, input);
  const kinds = input.kind === undefined ? Object.values(context.registry)
    .filter((kind) => kind.family === input.family && kind.inRepo.substrate === "tracked").map((kind) => kind.id) : [input.kind];
  const records: StoreRecord[] = [];
  const diagnostics: ListingDiagnostic[] = [];
  for (const kind of kinds) {
    for (const source of await kindSources(context, kind, input)) {
      if (input.owner !== undefined && !sameOwner(source.reference.owner, input.owner)) continue;
      const value = await listedRecord(context, source, input);
      if (value === undefined) continue;
      if ("reference" in value) records.push(value); else diagnostics.push(value);
    }
  }
  return listing(records, diagnostics, input);
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
  if (kind.startsWith("work-item/") && placement === undefined) return undefined;
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
function listing(records: StoreRecord[], diagnostics: ListingDiagnostic[], input: ListInput): ListingOutcome {
  const asOf = input.asOf === undefined ? {} : { asOf: input.asOf };
  return records.length === 0 && diagnostics.length === 0 ? { status: "absent", ...asOf }
    : { status: "complete", records, diagnostics, missed: diagnostics.length > 0, ...asOf };
}
async function listMetas(context: InRepoContext, input: ListInput): Promise<ListingOutcome> {
  const sources = await metaListingSources(context, input);
  const records: StoreRecord[] = [];
  const diagnostics: ListingDiagnostic[] = [];
  for (const source of sources) {
    const diagnostic = metaDiagnostic(source);
    if (diagnostic !== undefined) { diagnostics.push(diagnostic); continue; }
    const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: source.slug }));
    if (input.owner !== undefined && !sameOwner(reference.owner, input.owner)) continue;
    records.push({ reference, content: source.content ?? "", fields: source.fields, placement: source.placement,
      version: RecordVersionSchema.parse(digestBytes(Buffer.from(source.content ?? ""))), formatVersion: 1, conflicts: [] });
  }
  return listing(records, diagnostics, input);
}
interface KindSource { reference: RecordReference; path: string; meta?: MetaSource; revision?: string }
async function kindSources(context: InRepoContext, kind: KindId, input: ListInput): Promise<KindSource[]> {
  if (kind.startsWith("review/")) return reviewSources(context,kind,input);
  if (kind === "lineage/transition") return internalReferences(context, kind, input.asOf);
  if (kind === "project-inbox/inbox") {
    const reference = recordReferences[kind](input.owner ?? OwnerIdentitySchema.parse({ type: "project", name: "project" }));
    return [{ reference, path: await recordPath(context, reference) }];
  }
  if (kind === "cohort/document") return (await cohortPaths(context, input.asOf)).flatMap((path) => {
    const slug = SlugSchema.safeParse(/^cohort-(.+)\.md$/u.exec(basename(path))?.[1]);
    return slug.success ? [{ path, reference: recordReferences[kind](OwnerIdentitySchema.parse({ type: "cohort", name: slug.data })) }] : [];
  });
  if (!kind.startsWith("work-item/")) return [];
  const sources: KindSource[] = [];
  for (const meta of await metaListingSources(context, input)) {
    const owner = OwnerIdentitySchema.safeParse({ type: "work-item", name: meta.slug });
    if (!owner.success) continue;
    const keys = kind === "work-item/companion" ? await companionNames(context, meta) : [undefined];
    for (const key of keys) {
      const reference = RecordReferenceSchema.parse({ kind, owner: owner.data, ...(key === undefined ? {} : { key }) });
      sources.push({ reference, meta, revision:meta.revision, path: await recordPath(context, reference, meta) });
    }
  }
  return sources;
}
async function reviewSources(context: InRepoContext, kind: KindId, input: ListInput): Promise<KindSource[]> {
  const metas = await metaListingSources(context,{...input,filter:input.filter?.heldHere === true ? {heldHere:true} : undefined});
  const owners = new Map(metas.map((meta)=>[meta.slug,meta]));
  const sources = await internalReferences(context,kind,input.asOf);
  return sources.flatMap((source)=> {
    const meta = owners.get(source.reference.owner.name);
    if (input.filter?.heldHere === true && meta === undefined) return [];
    const location = meta?.location ?? "active";
    if (input.filter?.locations !== undefined && !input.filter.locations.includes(location)) return [];
    return [{...source,...(meta === undefined ? {} : {meta})}];
  });
}
async function metaListingSources(context: InRepoContext, input: ListInput): Promise<MetaSource[]> {
  const held = await heldMetaSources(context, input.asOf, input.filter?.heldHere === true ? input.filter.locations : undefined);
  if (input.asOf !== undefined || input.filter?.heldHere === true) return filterLocations(held, input);
  const composition = await composedMetas(context);
  const sources = new Map<string, MetaSource>();
  for (const slug of composition.recordsBySlug.keys()) {
    const source = await composedMetaSource(context, slug, composition);
    if (source !== undefined) sources.set(slug, source);
  }
  for (const source of held) {
    if (source.location === "active" || !sources.has(source.slug)) sources.set(source.slug || source.path, source);
  }
  return filterLocations([...sources.values()], input);
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
    condition: `${condition}: ${source.path}`, remedy: { text: `Repair ${source.path}, then list the records again.` } };
}
