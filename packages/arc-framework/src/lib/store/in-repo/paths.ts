/** Interim record discovery through layout roles and companion names. */
import { basename, dirname } from "node:path";
import { SlugSchema } from "../../kernel/schema/slug.js";
import { identifyWorkUnitArtifactPath, resolveArcPath } from "../../layout/index.js";
import type { KindId } from "../catalog.js";
import { OwnerIdentitySchema, RecordReferenceSchema, type RecordReference } from "../identity.js";
import type { InRepoContext } from "./context.js";
import { directoryAt } from "./files.js";
import { selectMeta, type MetaSource } from "./meta.js";
import { notFound } from "./refusals.js";

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
function companionPath(context: InRepoContext, reference: RecordReference, meta: MetaSource): string {
  const role = context.registry[reference.kind].inRepo.address?.artifact;
  const address = identifyWorkUnitArtifactPath(meta.path);
  if (role !== undefined && address !== null) {
    const artifact = role as "draft" | "spec" | "tasks" | "notes";
    return resolveArcPath({ kind: "work-unit-artifact", slug: reference.owner.name, placement: address.placement, artifact });
  }
  const key = reference.key;
  if (typeof key !== "string") throw new Error("A companion requires its name key");
  const file = key === "spec-prd" ? `spec-${reference.owner.name}-prd.md`
    : key === "spec-rfc" ? `spec-${reference.owner.name}-rfc.md` : `${key}-${reference.owner.name}.md`;
  return `${dirname(meta.path)}/${file}`;
}
async function filesUnder(context: InRepoContext, root: string, revision?: string): Promise<string[]> {
  let entries;
  try { entries = await directoryAt(context, root, revision); } catch { return []; }
  const paths: string[] = [];
  for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory()) paths.push(...await filesUnder(context, path, revision));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}
/** Discover cohort documents at their current planned or archived surfaces.
 * @param context - Backend dependencies.
 * @param revision - Saved state, or current working tree.
 * @returns Current role-named cohort document paths.
 */
export async function cohortPaths(context: InRepoContext, revision?: string): Promise<string[]> {
  const roots = [resolveArcPath({ kind: "placement-root", tier: "planned" }), resolveArcPath({ kind: "placement-root", tier: "completed" })];
  const paths = (await Promise.all(roots.map((root) => filesUnder(context, root, revision)))).flat();
  return paths.filter((path) => /^cohort-.+\.md$/u.test(basename(path)));
}
/** Discover references for a tracked kind with a fixed internal namespace.
 * @param context - Backend dependencies.
 * @param kind - Internal record kind.
 * @param revision - Saved state, or current working tree.
 * @returns References and the exact discovered paths.
 */
export async function internalReferences(context: InRepoContext, kind: KindId, revision?: string): Promise<{ reference: RecordReference; path: string }[]> {
  const example = RecordReferenceSchema.parse({ kind, owner: OwnerIdentitySchema.parse({ type: "work-item", name: "example" }) });
  const root = dirname(await recordPath(context, example));
  let entries;
  try { entries = await directoryAt(context, root, revision); } catch { return []; }
  const pattern = kind === "review/integration-boundary" ? /^(.+)\.boundary\.json$/u : /^(.+)\.json$/u;
  const values: { reference: RecordReference; path: string }[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || (kind === "review/candidate" && entry.name.endsWith(".boundary.json"))) continue;
    const parsed = SlugSchema.safeParse(pattern.exec(entry.name)?.[1]);
    if (!parsed.success) continue;
    const reference = RecordReferenceSchema.parse({ kind, owner: OwnerIdentitySchema.parse({ type: "work-item", name: parsed.data }) });
    values.push({ reference, path: await recordPath(context, reference) });
  }
  return values;
}
/** Discover nonstandard companions beside the selected work-unit copy.
 * @param context - Backend dependencies.
 * @param meta - Copy that determines companion locality.
 * @returns Logical name keys, excluding conventional roles and same-name cohort documents.
 */
export async function companionNames(context: InRepoContext, meta: MetaSource): Promise<string[]> {
  let entries;
  try { entries = await directoryAt(context, dirname(meta.path), meta.revision); } catch { return []; }
  const { artifactMatcher } = await import("../../work-unit/mutators/relocate-artifacts.js");
  const matcher = artifactMatcher(meta.slug);
  const roles = new Set(["meta", "draft", "spec", "tasks", "notes", "cohort"]);
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
