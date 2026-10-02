/** Meta record source selection shared by reads, listings, and write admission. */
import { basename, relative, sep } from "node:path";
import { parseMetaRecord } from "../../active/meta-reader.js";
import type { ParsedMetaRecord } from "../../active/meta-schema.js";
import { SlugSchema } from "../../kernel/schema/slug.js";
import { identifyWorkUnitArtifactPath, resolveArcPath } from "../../layout/index.js";
import { collectLifecycleMetaFiles, compareLifecycleSources, entryFromMeta } from "../../work-unit/lifecycle-index.js";
import type { ReadPlacement } from "../placement.js";
import type { InRepoContext } from "./context.js";
import { readFileAt } from "./files.js";
import { discoverDirectory, isAccessDenied } from "./discovery.js";
import type { ListingDiagnostic } from "../read.js";
import type { ComposedLifecycleIndexResult } from "../../work-unit/composed-lifecycle-index.js";

/** One selected copy and the tree where its bytes live. */
export interface MetaSource {
  slug: string;
  path: string;
  content: string | null;
  location: "active" | "planned" | "provisional" | "completed";
  revision?: string;
  placement?: ReadPlacement;
  fields?: ParsedMetaRecord;
  writable: boolean;
  checkout?: string;
}
/** Project a meta directory's physical placement to the contract.
 * @param path - Repository-relative meta path.
 * @returns Logical placement, or undefined for an unplaceable surface.
 */
export function placementFromPath(path: string): ReadPlacement | undefined {
  const placement = identifyWorkUnitArtifactPath(path)?.placement;
  if (placement === undefined) return undefined;
  if (placement.kind === "active") return { kind: "active" };
  if (placement.kind === "backlog") return { kind: "backlog", commitment: placement.commitment };
  return { kind: "completed", quarter: placement.quarter, sequence: placement.sequence };
}
function parsedFields(content: string | null): ParsedMetaRecord | undefined {
  if (content === null) return undefined;
  try { return parseMetaRecord(content); } catch { return undefined; }
}
/** Read a flat-active record before consulting any Git or cross-branch policy.
 * @param context - Backend dependencies.
 * @param slug - Validated work-unit slug.
 * @returns This checkout's active copy, if it is a regular file.
 */
export async function flatActiveMeta(context: InRepoContext, slug: string): Promise<MetaSource | undefined> {
  const path = resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: SlugSchema.parse(slug),
    placement: { kind: "active", scope: { kind: "project" } } });
  const content = await readFileAt(context, path);
  if (content === null) return undefined;
  return { slug, path, content, location: "active", placement: { kind: "active" },
    fields: parsedFields(content), writable: true };
}
/** Collect this tree's copies using the existing lifecycle walk and source order.
 * @param context - Backend dependencies.
 * @param revision - Saved tree, or the working tree.
 * @param locations - Requested lifecycle tiers; excluded tiers are not acquired.
 * @param diagnostics - Listing-owned evidence for inaccessible directories.
 * @returns One preferred copy per slug, including malformed and invalid-name entries.
 */
export async function heldMetaSources(context: InRepoContext, revision?: string,
  locations?: readonly MetaSource["location"][], diagnostics?: ListingDiagnostic[]): Promise<MetaSource[]> {
  const root = context.ports.checkoutRoot;
  const acquisition = metaDiscovery(context, revision, locations, diagnostics);
  const files = await collectLifecycleMetaFiles(root, acquisition.fs);
  acquisition.requireReadable();
  const candidates: MetaSource[] = [];
  for (const file of files) {
    if (locations !== undefined && !locations.includes(file.location)) continue;
    const path = relative(root, file.path).split(sep).join("/");
    const slug = /^meta-(.+)\.md$/u.exec(basename(path))?.[1] ?? "";
    let content: string | null;
    try { content = await readFileAt(context, path, revision); } catch (error) {
      if (!isAccessDenied(error)) throw error;
      content = null;
    }
    candidates.push({ slug, path, content, location: file.location, revision,
      placement: placementFromPath(path), fields: parsedFields(content), writable: revision === undefined });
  }
  return preferredCopies(candidates);
}
function metaDiscovery(context: InRepoContext, revision?: string, locations?: readonly MetaSource["location"][], diagnostics?: ListingDiagnostic[]) {
  const roots = locations?.map((tier) => resolveArcPath({ kind: "placement-root", tier }));
  const failures: unknown[] = [];
  return { fs: { ...context.ports.fs, readdir: async (path: string) => {
    const local = relative(context.ports.checkoutRoot, path).split(sep).join("/");
    if (roots !== undefined && !roots.some((root) => local === root || local.startsWith(`${root}/`))) return [];
    try { return await discoverDirectory(context, local, revision, diagnostics); }
    catch (error) { failures.push(error); throw error; }
  } }, requireReadable: () => { if (failures.length > 0) throw failures[0]; } };
}
function preferredCopies(candidates: MetaSource[]): MetaSource[] {
  const bySlug = new Map<string, MetaSource[]>();
  for (const candidate of candidates) {
    const key = SlugSchema.safeParse(candidate.slug).success ? candidate.slug : candidate.path;
    bySlug.set(key, [...(bySlug.get(key) ?? []), candidate]);
  }
  return [...bySlug.values()].map((copies) => {
    copies.sort(compareLifecycleSources);
    const active = copies.find((copy) => copy.location === "active");
    const accepted = copies.find((copy) => copy.content !== null && entryFromMeta(copy.path, copy.content) !== null);
    const preferred = active ?? accepted ?? copies[0];
    if (preferred === undefined) throw new Error("A source group has no record");
    return preferred;
  });
}

/** Resolve local branch membership with the same identity used by record writers.
 * @param context - Backend dependencies.
 * @param diagnostics - Listing-owned evidence for inaccessible working-tree directories.
 * @returns Today's composed lifecycle view with no fetch or prospective overlay.
 */
export async function composedMetas(context: InRepoContext, diagnostics?: ListingDiagnostic[]): Promise<ComposedLifecycleIndexResult> {
  const [{ resolveComposedLifecycleIndex }, { readConfigSettings }, transient] = await Promise.all([
    import("../../work-unit/composed-lifecycle-index.js"), import("../../config/status-reader.js"),
    import("../../errand/record.js"),
  ]);
  const { ports } = context;
  const exec: typeof ports.exec = (command, args, options) => ports.exec(command, args, { cwd: ports.checkoutRoot, ...options });
  const identity = await ports.identity();
  const read = transient.projectTransientInFlightRead(await transient.readTransientInFlightIndexes({ exec, identity }));
  const { settings } = await readConfigSettings(ports.checkoutRoot);
  const acquisition = metaDiscovery(context, undefined, undefined, diagnostics);
  const composition = await resolveComposedLifecycleIndex({ cwd: ports.checkoutRoot, fs: acquisition.fs, oracle: {
    exec, acquisitionPolicy: "local", baseBranch: settings["branch.base"],
    errandSlugByBranch: read.indexes.slugByBranch, errandRecordsComplete: read.complete,
  } });
  acquisition.requireReadable();
  return composition;
}
function sourceLocation(path: string, context: InRepoContext): { path: string; revision?: string } {
  const delimiter = path.indexOf(":.arc/");
  if (delimiter >= 0) return { revision: path.slice(0, delimiter), path: path.slice(delimiter + 1) };
  return { path: path.startsWith(".arc/") ? path : relative(context.ports.checkoutRoot, path).split(sep).join("/") };
}
/** Read the composed copy while retaining agreeing working-tree bytes as the mutation basis.
 * @param context - Backend dependencies.
 * @param slug - Work-unit slug.
 * @param composition - Current local-branch composition.
 * @returns The selected record's source and fields, if it exists.
 */
export async function composedMetaSource(context: InRepoContext, slug: string,
  composition: ComposedLifecycleIndexResult): Promise<MetaSource | undefined> {
  const record = composition.recordsBySlug.get(slug);
  if (record === undefined || record.selected.source.path === undefined) return undefined;
  const selected = sourceLocation(record.selected.source.path, context);
  const operational = record.writablePath === undefined ? selected : { path: record.writablePath };
  const content = await readFileAt(context, operational.path, operational.revision);
  const selectedContent = operational.path === selected.path && operational.revision === selected.revision
    ? content : await readFileAt(context, selected.path, selected.revision);
  const placementPath = record.selected.location === "planned" && record.currentTree?.location === "planned"
    ? sourceLocation(record.currentTree.source.path ?? "", context).path : operational.path;
  return { slug, ...operational, content, location: record.selected.location,
    placement: placementFromPath(placementPath), fields: parsedFields(selectedContent),
    writable: record.writablePath !== undefined || operational.revision === undefined,
    checkout: composition.worktreePathBySlug.get(slug) ?? selected.revision };
}
/** Select a meta with flat-active precedence, or from exactly one saved tree.
 * @param context - Backend dependencies.
 * @param slug - Work-unit slug.
 * @param revision - Saved state; absent selects the live local composition.
 * @returns The source a record read and write admission must share.
 */
export async function selectMeta(context: InRepoContext, slug: string, revision?: string): Promise<MetaSource | undefined> {
  if (revision !== undefined) return (await heldMetaSources(context, revision)).find((source) => source.slug === slug);
  const flat = await flatActiveMeta(context, slug);
  if (flat !== undefined) return flat;
  return composedMetaSource(context, slug, await composedMetas(context));
}
