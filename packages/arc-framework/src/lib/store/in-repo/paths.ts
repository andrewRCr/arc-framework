/** Interim record discovery through layout roles and companion names. */
import { basename, dirname } from "node:path";
import { SlugSchema } from "../../kernel/schema/slug.js";
import { identifyWorkUnitArtifactPath, resolveArcPath } from "../../layout/index.js";
import type { KindId } from "../catalog.js";
import { OwnerIdentitySchema, RecordReferenceSchema, type RecordReference } from "../identity.js";
import type { InRepoContext } from "./context.js";
import type { ListingDiagnostic } from "../read.js";
import { discoverDirectory } from "./discovery.js";
import { selectMeta, type MetaSource } from "./meta.js";
import { notFound, unsupported } from "./refusals.js";

const conventionalRoles = {
  meta: "work-item/meta", tasks: "work-item/task-list", draft: "work-item/draft", spec: "work-item/spec",
  notes: "work-item/notes", cohort: "cohort/document",
} as const;

/** Resolve one role without putting a physical path into its public reference.
 * @param context - Backend dependencies.
 * @param reference - Record role and owner.
 * @param meta - Optional already-selected work-unit copy.
 * @returns Repository-relative path where that copy's record lives.
 */
export async function recordPath(context: InRepoContext, reference: RecordReference, meta?: MetaSource, revision?: string): Promise<string> {
  const slug = reference.owner.name;
  const home = context.registry[reference.kind].inRepo;
  const role = home.address;
  if (role?.kind === "candidate-record") return resolveArcPath({ kind: "candidate-record", slug });
  if (role?.kind === "integration-boundary-record") return resolveArcPath({ kind: "integration-boundary-record", slug });
  if (role?.kind === "transition-record") return resolveArcPath({ kind: "transition-record", origin: slug });
  if (role?.kind === "inbox") return resolveArcPath({ kind: "inbox", scope: { kind: "project" } });
  if (role?.kind === "cohort-document") {
    const existing = (await cohortPaths(context, revision)).find((path) => basename(path) === `cohort-${slug}.md`);
    return existing ?? resolveArcPath({ kind: "cohort-document", cohort: [slug], placement: { kind: "planned" } });
  }
  const selected = meta ?? await selectMeta(context, slug);
  if (selected === undefined) return notFound(reference, "Create the work unit's meta with this record in one batch, then retry.");
  if (reference.kind === "work-item/meta") return selected.path;
  return companionPath(context, reference, selected);
}
async function companionPath(context: InRepoContext, reference: RecordReference, meta: MetaSource): Promise<string> {
  const role = context.registry[reference.kind].inRepo.address?.artifact;
  const address = identifyWorkUnitArtifactPath(meta.path);
  if (role !== undefined && address !== null) {
    const artifact = role as "draft" | "spec" | "tasks" | "notes";
    return resolveArcPath({ kind: "work-unit-artifact", slug: reference.owner.name, placement: address.placement, artifact });
  }
  const key = reference.key;
  if (typeof key !== "string") throw new Error("A companion requires its name key");
  if (Object.hasOwn(conventionalRoles, key)) {
    const kind = conventionalRoles[key as keyof typeof conventionalRoles];
    return unsupported("unhomed-kind", `The companion name ${key} belongs to the registered ${kind} role.`,
      `Address this file through its registered ${kind} role, then retry.`);
  }
  const file = key === "spec-prd" ? `spec-${reference.owner.name}-prd.md`
    : key === "spec-rfc" ? `spec-${reference.owner.name}-rfc.md` : `${key}-${reference.owner.name}.md`;
  const { artifactMatcher } = await import("../../work-unit/mutators/relocate-artifacts.js");
  if (key !== "spec-prd" && key !== "spec-rfc" && !artifactMatcher(reference.owner.name).test(file)) {
    return unsupported("unhomed-kind", `The companion name ${key} is outside this layout's discoverable artifact names.`,
      "Use a lowercase-letter companion name, or spec-prd/spec-rfc for a paired spec, then retry.");
  }
  return `${dirname(meta.path)}/${file}`;
}
async function filesUnder(context: InRepoContext, root: string, revision?: string, diagnostics?: ListingDiagnostic[]): Promise<string[]> {
  const entries = await discoverDirectory(context, root, revision, diagnostics);
  const paths: string[] = [];
  for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory()) paths.push(...await filesUnder(context, path, revision, diagnostics));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}
/** Discover cohort documents at their current planned or archived surfaces.
 * @param context - Backend dependencies.
 * @param revision - Saved state, or current working tree.
 * @param diagnostics - Listing-owned evidence for inaccessible directories.
 * @returns Current role-named cohort document paths.
 */
export async function cohortPaths(context: InRepoContext, revision?: string, diagnostics?: ListingDiagnostic[]): Promise<string[]> {
  const roots = [resolveArcPath({ kind: "placement-root", tier: "planned" }), resolveArcPath({ kind: "placement-root", tier: "completed" })];
  const paths = (await Promise.all(roots.map((root) => filesUnder(context, root, revision, diagnostics)))).flat();
  const selected: string[] = [];
  const names = new Set<string>();
  for (const path of paths) {
    const match = /^cohort-(.*)\.md$/u.exec(basename(path));
    if (match === null) continue;
    const slug = SlugSchema.safeParse(match[1]);
    if (!slug.success) { selected.push(path); continue; }
    if (names.has(slug.data)) continue;
    names.add(slug.data);
    selected.push(path);
  }
  return selected;
}
/** Discover references for a tracked kind with a fixed internal namespace.
 * @param context - Backend dependencies.
 * @param kind - Internal record kind.
 * @param revision - Saved state, or current working tree.
 * @param diagnostics - Listing-owned evidence for inaccessible namespaces.
 * @returns References and the exact discovered paths.
 */
export async function internalReferences(context: InRepoContext, kind: KindId, revision?: string, diagnostics?: ListingDiagnostic[]): Promise<{ reference: RecordReference; path: string }[]> {
  const example = RecordReferenceSchema.parse({ kind, owner: OwnerIdentitySchema.parse({ type: "work-item", name: "example" }) });
  const root = dirname(await recordPath(context, example));
  const entries = await discoverDirectory(context, root, revision, diagnostics);
  const pattern = kind === "review/integration-boundary" ? /^(.*)\.boundary\.json$/u : /^(.*)\.json$/u;
  const values: { reference: RecordReference; path: string }[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || (kind === "review/candidate" && entry.name.endsWith(".boundary.json"))) continue;
    const match = pattern.exec(entry.name);
    if (match === null) continue;
    const parsed = SlugSchema.safeParse(match[1]);
    if (!parsed.success) { diagnostics?.push(invalidTrackedCoordinate(`${root}/${entry.name}`)); continue; }
    const reference = RecordReferenceSchema.parse({ kind, owner: OwnerIdentitySchema.parse({ type: "work-item", name: parsed.data }) });
    values.push({ reference, path: await recordPath(context, reference) });
  }
  return values;
}
/** Preserve a recognized record whose filename cannot form a logical reference.
 * @param path - Discovered record path with an invalid owner coordinate.
 * @returns A per-entry diagnostic with a retryable repair route.
 */
export function invalidTrackedCoordinate(path: string): ListingDiagnostic {
  return { kind: "malformed", key: path, condition: `The record filename carries an invalid owner slug: ${path}`,
    remedy: { text: `Repair the record filename ${path}, then list the records again.` } };
}
/** Discover nonstandard companions beside the selected work-unit copy.
 * @param context - Backend dependencies.
 * @param meta - Copy that determines companion locality.
 * @param diagnostics - Listing-owned evidence for an inaccessible companion directory.
 * @returns Logical name keys, excluding conventional roles and same-name cohort documents.
 */
export async function companionNames(context: InRepoContext, meta: MetaSource, diagnostics?: ListingDiagnostic[]): Promise<string[]> {
  const entries = await discoverDirectory(context, dirname(meta.path), meta.revision, diagnostics);
  const { artifactMatcher } = await import("../../work-unit/mutators/relocate-artifacts.js");
  const matcher = artifactMatcher(meta.slug);
  const roles = new Set(Object.keys(conventionalRoles));
  const keys: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === `spec-${meta.slug}-prd.md`) keys.push("spec-prd");
    else if (entry.name === `spec-${meta.slug}-rfc.md`) keys.push("spec-rfc");
    else if (matcher.test(entry.name)) {
      const key = entry.name.slice(0, -`-${meta.slug}.md`.length);
      if (!roles.has(key)) keys.push(key);
    }
  }
  return keys.sort();
}
