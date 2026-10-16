/** Atomic rename preparation over whole record groups and the shared reference sweep. */
import { posix } from "node:path";
import { SlugSchema } from "../kernel/index.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import { ParsedMetaRecordSchema, MetaPauseSchema } from "../active/meta-schema.js";
import { recordReferences, OwnerIdentitySchema, RecordReferenceSchema, sameReference, sameOwner } from "./identity.js";
import { readLifecycleView } from "./lifecycle-view.js";
import { requireCompleteInventory } from "./lifecycle-storage.js";
import { readWorkUnit, recordPut, mergeLifecycleLinks, workUnitMetaPath } from "./lifecycle-write.js";
import { lifecycleRecordPath } from "./lifecycle-record-path.js";
import { acquireLifecycleRecords, revalidateLifecycleRecords, type PreparedLifecycleWrite } from "../work-unit/prepared-lifecycle-write.js";
import { readPairedReferenceOwners } from "../work-unit/paired-reference-owners.js";
import { planRenameReferences, applyRenameReferencePlan, rewriteBacktickedArtifactReferences } from "../work-unit/rename-reference-sweep.js";
import { writeMetaTitle, writeMetaDesign, writeMetaTaskList, writeMetaPause } from "./kinds/meta/writers.js";
import { rewriteCohortMemberHeading } from "./kinds/cohort/index.js";
import type { Store } from "./contract.js";
import type { StoreRecord } from "./read.js";
import type { StoreResult } from "./refusal.js";
import type { BranchLink } from "./links.js";
/** Selected subject and reporting evidence retained independently of physical checkout steps. */
export interface StoreRenameSubject { primary: StoreRecord; resuming: boolean; originName: string; advisories: string[] }
/** Complete acquisition and expected-version writes prepared before physical renames. */
export interface PreparedStoreRename extends PreparedLifecycleWrite { subject: StoreRenameSubject }
/** Read a complete inventory, collision-check the target, and recover a prior rename's original name.
 * @param store - Operational state contract.
 * @param request - Source handle and proposed current name.
 * @returns Selected primary and coordination advisories, or exact store refusal.
 */
export async function readStoreRenameSubject(store: Store, request: { sourceSlug: string; targetSlug: string }): Promise<StoreResult<StoreRenameSubject>> {
  const source = SlugSchema.parse(request.sourceSlug), target = SlugSchema.parse(request.targetSlug);
  const view = await readLifecycleView(store); if (view.status === "refused") return view;
  requireCompleteInventory(store, view.result.listing);
  const read = await readWorkUnit(store, source); if (read.status === "refused") return read;
  const primary = read.result;
  const collision = await store.lookup({ kind: "slug", slug: target });
  if (collision.status === "ok" && !sameReference(collision.result.reference, primary.reference)) return malformed(primary, `The name ${target} belongs to another work item.`);
  if (collision.status === "refused" && collision.refusal.code !== "not-found") return collision;
  const fields = ParsedMetaRecordSchema.parse(primary.fields);
  const resuming = primary.reference.owner.name === target;
  if (!resuming && primary.placement?.kind !== "completed" && fields.candidateId !== null) return malformed(primary, "A work unit with Candidate publication state cannot be renamed.");
  const origin = resuming ? await renameOrigin(store, primary, source) : { status: "ok" as const, result: primary.reference.owner.name };
  if (origin.status === "refused") return origin;
  const advisories = view.result.entries.filter((entry) => entry.fields.state === "Integrating" && entry.fields.dependsOn.includes(origin.result))
    .map((entry) => `Work unit \`${entry.reference.owner.name}\` is Integrating with a live \`Depends On\` edge to \`${origin.result}\`. Coordinate before transforming the origin; this transform will not mutate that dependent.`);
  return { status: "ok", result: { primary, resuming, originName: origin.result, advisories } };
}
async function renameOrigin(store: Store, primary: StoreRecord, fallback: string): Promise<StoreResult<string>> {
  const history = await store.history({ reference: primary.reference }); if (history.status === "refused") return history;
  const previous = history.result.find((entry) => entry.reference.kind === "work-item/meta" && entry.reference.owner.name !== primary.reference.owner.name);
  return { status: "ok", result: previous?.reference.owner.name ?? fallback };
}
/** Prepare the owned record group, shared stubs, and exact cohort member edits as one batch.
 * @param store - Operational state contract.
 * @param subject - Collision-checked subject and its original canonical name.
 * @param targetSlug - New display name on the same UID.
 * @param branch - Optional explicit branch-link replacement.
 * @returns Every acquired version and its proposed writes.
 */
export async function prepareStoreRename(store: Store, subject: StoreRenameSubject, targetSlug: string,
  branch?: { prior: BranchLink; next: BranchLink }): Promise<StoreResult<PreparedStoreRename>> {
  const groups = await acquireRenameGroups(store, subject.primary); if (groups.status === "refused") return groups;
  const basis = await revalidateLifecycleRecords(store, [subject.primary]); if (basis.status === "refused") return basis;
  const records = groups.result;
  const artifactRenames = ownedArtifactRenames(records, subject.primary, targetSlug);
  const ambiguity = await checkSharedPairedReferences(store, records, subject.primary, artifactRenames, subject.originName, targetSlug);
  if (ambiguity !== undefined) return ambiguity;
  const virtual = renameProjection(records, subject.primary);
  const sweep = await planRenameReferences({ arcRoot: ".arc", sourceSlug: subject.originName, targetSlug, artifactRenames }, virtual.context);
  await applyRenameReferencePlan(sweep, virtual.context);
  const writes = records.flatMap((record) => renameMutation(record, subject, targetSlug, virtual.contents.get(record), branch, artifactRenames));
  return { status: "ok", result: { subject, records, writes } };
}
function ownedArtifactRenames(records: readonly StoreRecord[], primary: StoreRecord, target: string): Map<string, string> {
  const renamed = { ...primary, reference: RecordReferenceSchema.parse({ ...primary.reference,
    owner: { ...primary.reference.owner, name: target } }) };
  const names = new Map<string, string>();
  for (const record of records) {
    if (!sameOwner(record.reference.owner, primary.reference.owner)) continue;
    const from = lifecycleRecordPath(primary, record), to = lifecycleRecordPath(renamed, record);
    if (from !== null && to !== null) names.set(posix.relative(posix.dirname(workUnitMetaPath(primary)), from), posix.relative(posix.dirname(workUnitMetaPath(renamed)), to));
  }
  return names;
}
async function acquireRenameGroups(store: Store, primary: StoreRecord): Promise<StoreResult<StoreRecord[]>> {
  const own = await acquireLifecycleRecords(store, primary.reference.owner.name); if (own.status === "refused") return own;
  const records = [...own.result];
  const view = await readLifecycleView(store); if (view.status === "refused") return view;
  requireCompleteInventory(store, view.result.listing);
  for (const entry of view.result.entries) {
    if (entry.placement.kind !== "backlog" || sameReference(entry.reference, primary.reference)) continue;
    const group = await acquireLifecycleRecords(store, entry.reference.owner.name); if (group.status === "refused") return group;
    records.push(...group.result);
  }
  const cohort = ParsedMetaRecordSchema.parse(primary.fields).cohort?.split("/").at(-1);
  if (cohort !== undefined) {
    const doc = await store.read({ reference: recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: cohort })) });
    if (doc.status === "refused") return doc;
    records.push(doc.result);
  }
  return { status: "ok", result: records };
}
function renameProjection(records: StoreRecord[], primary: StoreRecord) {
  const contents = new Map(records.map((record) => [record, record.content]));
  const paths = new Map<string, StoreRecord>();
  for (const record of records) {
    const own = record.reference.owner.type !== "person" && primary.reference.owner.type !== "person" && record.reference.owner.uid === primary.reference.owner.uid;
    const groupPrimary = own ? primary : records.find((candidate) => candidate.reference.kind === "work-item/meta" && candidate.reference.owner.type !== "person" && record.reference.owner.type !== "person" && candidate.reference.owner.uid === record.reference.owner.uid);
    const projected = groupPrimary === undefined ? null : lifecycleRecordPath(groupPrimary, record);
    const filename = projected === null || groupPrimary === undefined ? `${record.reference.kind.replaceAll("/", "-")}-${record.reference.owner.name}.md` : posix.relative(posix.dirname(workUnitMetaPath(groupPrimary)), projected);
    const path = posix.join(".arc", "active", record.reference.owner.name, filename);
    paths.set(path, record);
  }
  return { contents, context: {
    listFiles: () => Promise.resolve([...paths.keys()].map((path) => path.slice(".arc/".length))),
    readFile: (path: string) => { const record = paths.get(path); if (record === undefined) throw new Error(`Unacquired rename path ${path}`); return Promise.resolve(contents.get(record) ?? record.content); },
    writeFile: (path: string, content: string) => { const record = paths.get(path); if (record === undefined) throw new Error(`Unacquired rename path ${path}`); contents.set(record, content); return Promise.resolve(); },
  } };
}
function renameMutation(record: StoreRecord, subject: StoreRenameSubject, targetSlug: string, proposed: string | undefined,
  branch: { prior: BranchLink; next: BranchLink } | undefined, artifactRenames: ReadonlyMap<string, string>) {
  let content = proposed ?? record.content;
  const own = record.reference.owner.type !== "person" && subject.primary.reference.owner.type !== "person" && record.reference.owner.uid === subject.primary.reference.owner.uid;
  if (record.reference.kind === "cohort/document") content = rewriteCohortMemberHeading(content, subject.originName, targetSlug);
  if (record.reference.kind === "work-item/meta") content = renameMeta(content, subject.originName, targetSlug, own, artifactRenames);
  if (!own && content === record.content) return [];
  const put = recordPut(record, { content });
  if (own) put.reference = RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name: targetSlug } });
  if (sameReference(record.reference, subject.primary.reference) && branch !== undefined && put.action === "put") {
    put.links = mergeLifecycleLinks(record.links, { branches: [branch.next] }, { branches: [branch.prior] });
  }
  return [put];
}
function renameMeta(content: string, source: string, target: string, own: boolean, artifactRenames: ReadonlyMap<string, string>): string {
  const fields = parseMetaRecord(content);
  let result = content;
  if (own) {
    result = writeMetaTitle(result, SlugSchema.parse(target));
    const rewrite = (value: string): string => artifactRenames.get(value)
      ?? (value.endsWith(`-${source}.md`) ? `${value.slice(0, -source.length - 3)}${target}.md` : value);
    result = writeMetaDesign(result, fields.design.map(rewrite));
    result = writeMetaTaskList(result, fields.taskList === null ? null : rewrite(fields.taskList));
  }
  if (fields.pause?.waitsOn?.kind === "work-unit" && fields.pause.waitsOn.slug === source) {
    result = writeMetaPause(result, { ...MetaPauseSchema.parse(fields.pause), waitsOn: { kind: "work-unit", slug: SlugSchema.parse(target) } });
  }
  return result;
}
function malformed(primary: StoreRecord, condition: string): StoreResult<never> {
  return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: primary.reference, rule: "lifecycle.rename",
    condition, remedy: { text: "Repair the reported rename condition or choose an unused work-unit name, then retry." } } };
}

async function checkSharedPairedReferences(store: Store, records: readonly StoreRecord[], primary: StoreRecord,
  artifactRenames: ReadonlyMap<string, string>, source: string, target: string): Promise<StoreResult<never> | undefined> {
  const shared = records.filter((record) => !sameOwner(record.reference.owner, primary.reference.owner));
  const interpretations = await readPairedReferenceOwners(store, shared, new Set());
  if (interpretations.status === "refused") return interpretations;
  for (const [filename, owners] of interpretations.result) {
    const reference = `\`${filename}\``;
    const rewritten = artifactRenames.has(filename) || rewriteBacktickedArtifactReferences(reference, source, target) !== reference;
    if (owners.length > 1 && rewritten
      && shared.some((record) => record.content.includes(`\`${filename}\``))) {
      return malformed(primary, `Ambiguous artifact reference ${filename}: possible owners ${owners.map((owner) => owner.subject).join(", ")}. Disambiguate the shared reference before retrying rename.`);
    }
  }
  return undefined;
}
