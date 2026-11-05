/** Atomic rename preparation over whole record groups and the shared reference sweep. */
import { posix } from "node:path";
import { SlugSchema } from "../kernel/index.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import { ParsedMetaRecordSchema, MetaPauseSchema } from "../active/meta-schema.js";
import { recordReferences, OwnerIdentitySchema, RecordReferenceSchema, sameReference, sameOwner } from "./identity.js";
import { readLifecycleView } from "./lifecycle-view.js";
import { requireCompleteInventory } from "./lifecycle-storage.js";
import { recordPut, mergeLifecycleLinks, workUnitMetaPath } from "./lifecycle-write.js";
import { lifecycleRecordPath } from "./lifecycle-record-path.js";
import { acquireLifecycleRecords, revalidateLifecycleRecords, type PreparedLifecycleWrite } from "../work-unit/prepared-lifecycle-write.js";
import { readPairedReferenceOwners } from "../work-unit/paired-reference-owners.js";
import { planRenameReferences, applyRenameReferencePlan, rewriteBacktickedArtifactReferences } from "../work-unit/rename-reference-sweep.js";
import { writeMetaTitle, writeMetaDesign, writeMetaTaskList, writeMetaPause, writeMetaDependsOn } from "./kinds/meta/writers.js";
import { rewriteCohortMemberHeading } from "./kinds/cohort/index.js";
import type { Store } from "./contract.js";
import type { StoreRecord } from "./read.js";
import type { StoreResult, Remedy } from "./refusal.js";
import type { BranchLink } from "./links.js";
import { memberCohortReadRefusal } from "./cohort-membership-refusal.js";
import { checkCreationAdmission, renderCreationAdmissionRefusal } from "./creation-admission.js";
import { settleCreationSlugEdges, type CreationSlugSettlement } from "./creation-slug-settlement.js";
import { resolveRetiredEdge } from "./retired-edge.js";
import { replaceDependencySlot } from "./dependency-slot.js";
import { observeRecords } from "./record-observations.js";
import type { Mutation, RecordObservation } from "./write.js";
import type { LifecycleEntry } from "./lifecycle-index.js";
import { resolveRenameReferences } from "./rename-reference-resolution.js";
import { workUnitRenameReferenceReport } from "./rename-reference-report.js";
import type { RenameReport } from "../work-unit/rename-report.js";
/** Selected subject and reporting evidence retained independently of physical checkout steps. */
export interface StoreRenameSubject { primary: StoreRecord; operand: string; resuming: boolean; originName: string; advisories: string[] }
/** Complete acquisition and expected-version writes prepared before physical renames. */
export interface PreparedStoreRename extends PreparedLifecycleWrite { subject: StoreRenameSubject; report: RenameReport }
/** Read a complete inventory, admit the target by creation rules, and recover a prior rename's original name.
 * @param store - Operational state contract.
 * @param request - Selected primary, original operand, and proposed current name.
 * @returns Selected primary and coordination advisories, or exact store refusal.
 */
export async function readStoreRenameSubject(store: Store, request: { primary: StoreRecord; operand: string; targetSlug: string }): Promise<StoreResult<StoreRenameSubject>> {
  const target = SlugSchema.parse(request.targetSlug), primary = request.primary;
  const view = await readLifecycleView(store); if (view.status === "refused") return view;
  requireCompleteInventory(store, view.result.listing);
  const admission = await checkCreationAdmission(store, target, [primary.reference.owner]);
  if (admission.kind !== "free") {
    const rendered = renderCreationAdmissionRefusal(target, admission);
    return malformed(primary, rendered.condition, { ...rendered.remedy, text: rendered.remedy.text.replaceAll("retry creation", "retry rename") });
  }
  const fields = ParsedMetaRecordSchema.parse(primary.fields);
  const resuming = primary.reference.owner.name === target;
  const publication = await checkRenamePublication(store, primary, resuming, fields.candidateId);
  if (publication !== undefined) return publication;
  const origin = resuming ? await renameOrigin(store, primary, primary.reference.owner.name) : { status: "ok" as const, result: primary.reference.owner.name };
  if (origin.status === "refused") return origin;
  if (resuming && origin.result === target) return malformed(primary, "Rename needs distinct source and target names.");
  const advisories = view.result.entries.filter((entry) => entry.fields.state === "Integrating" && entry.fields.dependsOn.includes(origin.result))
    .map((entry) => `Work unit \`${entry.reference.owner.name}\` is Integrating with a live \`Depends On\` edge to \`${origin.result}\`. Coordinate before transforming the origin; this transform will not mutate that dependent.`);
  return { status: "ok", result: { primary, operand: request.operand, resuming, originName: origin.result, advisories } };
}

/** Preserve strict namespace admission for a cohort's proposed rename target. */
export async function checkCohortRenameTarget(store: Store, primary: StoreRecord, target: string): Promise<StoreResult<never> | undefined> {
  const collision = await store.lookup({ kind: "slug", slug: SlugSchema.parse(target) });
  if (collision.status === "ok" && !sameReference(collision.result.reference, primary.reference)) return malformed(primary, `The name ${target} belongs to another work item.`);
  return collision.status === "refused" && collision.refusal.code !== "not-found" ? collision : undefined;
}
async function checkRenamePublication(store: Store, primary: StoreRecord, resuming: boolean,
  legacyCandidateId: string | null): Promise<StoreResult<never> | undefined> {
  if (resuming) return undefined;
  if (!store.capabilities.stateOffBranch) return primary.placement?.kind !== "completed" && legacyCandidateId !== null
    ? malformed(primary, "A work unit with Candidate publication state cannot be renamed.") : undefined;
  const candidate = await store.read({ reference: recordReferences["review/candidate"](primary.reference.owner) });
  if (candidate.status === "ok") return malformed(primary, "A work unit with Candidate publication state cannot be renamed.");
  return candidate.refusal.code === "not-found" ? undefined : candidate;
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
  const records = groups.result.records;
  const resolution = await resolveRenameReferences(store, subject.primary.reference, subject.originName);
  if (resolution.status === "refused") return resolution;
  const settlement = await settleCreationSlugEdges(store, targetSlug, subject.primary.reference.owner);
  const unseen = settlement.writes.filter(write => !records.some(record => sameReference(record.reference, write.reference)));
  if (unseen.length > 0) return { status: "refused", refusal: { code: "version-conflict", class: "recoverable",
    records: unseen.map(write => write.reference), condition: "The set of backlog records changed during rename preparation.",
    remedy: { text: "Acquire the complete rename groups again, then retry.", argv: ["arc", "rename", subject.operand, targetSlug] } } };
  const own = await settleOwnRenameEdge(store, subject, targetSlug); if (own.status === "refused") return own;
  const observations = mergeRenameObservations([...settlement.observations, ...own.result.observations], subject, targetSlug);
  if (observations.status === "refused") return observations;
  const artifactRenames = ownedArtifactRenames(records, subject.primary, targetSlug);
  const ambiguity = resolution.result === "subject"
    ? await checkSharedPairedReferences(store, records, subject.primary, artifactRenames, subject.originName, targetSlug) : undefined;
  if (ambiguity !== undefined) return ambiguity;
  const virtual = renameProjection(records, subject.primary, [...settlement.writes, ...own.result.writes], resolution.result === "subject");
  const sweep = await planRenameReferences({ arcRoot: ".arc", sourceSlug: subject.originName, targetSlug, artifactRenames }, virtual.context);
  await applyRenameReferencePlan(sweep, virtual.context);
  const writes = records.flatMap((record) => renameMutation(record, subject, targetSlug, virtual.contents.get(record), branch, artifactRenames,
    resolution.result === "subject"));
  const retained = records.map(record => {
    const write = writes.find(item => sameReference(item.reference, record.reference));
    return write?.action === "put" ? { ...record, content: write.content } : record;
  });
  const report = workUnitRenameReferenceReport({ primary: subject.primary, records: retained, entries: groups.result.entries,
    resolution: resolution.result, source: subject.originName, target: targetSlug, artifactRenames });
  return { status: "ok", result: { subject, records, writes, observations: observations.result, report } };
}
async function settleOwnRenameEdge(store: Store, subject: StoreRenameSubject, target: string): Promise<StoreResult<CreationSlugSettlement>> {
  const primary = subject.primary, fields = ParsedMetaRecordSchema.parse(primary.fields);
  if (!fields.dependsOn.includes(target)) return { status: "ok", result: { writes: [], observations: [] } };
  const resolved = await resolveRetiredEdge(store, target, primary.reference.owner);
  if (resolved.status === "refused") return resolved;
  if (resolved.result === null) return malformed(primary, `The subject's dependency on ${target} has no proven prior-provider disposition.`,
    { text: "Settle the subject's Depends On edge explicitly or choose another target name, then retry.",
      argv: ["arc", "rename", subject.operand, target] });
  const { disposition, records } = resolved.result;
  const targets = replaceDependencySlot(fields.dependsOn, new Set([target]), disposition.kind === "drop" ? [] : disposition.replacementTargets);
  return { status: "ok", result: { writes: [recordPut(primary, { content: writeMetaDependsOn(primary.content, targets) })],
    observations: observeRecords(records) } };
}
function mergeRenameObservations(observations: readonly RecordObservation[], subject: StoreRenameSubject,
  target: string): StoreResult<RecordObservation[]> {
  const merged: RecordObservation[] = [];
  for (const observation of observations) {
    const prior = merged.find(item => sameReference(item.reference, observation.reference));
    if (prior === undefined) { merged.push(observation); continue; }
    if (sameExpectation(prior.expected, observation.expected)) continue;
    return { status: "refused", refusal: { code: "version-conflict", class: "recoverable", records: [observation.reference],
      condition: "Rename preparation observed contradictory versions, presence, or conflicts for one record.",
      remedy: { text: "Acquire current provider evidence and prepare the rename again.", argv: ["arc", "rename", subject.operand, target] } } };
  }
  return { status: "ok", result: merged };
}
function sameExpectation(left: RecordObservation["expected"], right: RecordObservation["expected"]): boolean {
  if (left === null || right === null) return left === right;
  return left.version === right.version && left.conflicts.length === right.conflicts.length
    && left.conflicts.every(reference => right.conflicts.some(other => sameReference(reference, other)));
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
async function acquireRenameGroups(store: Store, primary: StoreRecord): Promise<StoreResult<{ records: StoreRecord[]; entries: readonly LifecycleEntry[] }>> {
  const own = await acquireLifecycleRecords(store, primary.reference); if (own.status === "refused") return own;
  const records = [...own.result];
  const view = await readLifecycleView(store); if (view.status === "refused") return view;
  requireCompleteInventory(store, view.result.listing);
  for (const entry of view.result.entries) {
    if (entry.placement.kind !== "backlog" || entry.fields.state !== "Planning" || sameReference(entry.reference, primary.reference)) continue;
    const group = await acquireLifecycleRecords(store, entry.reference); if (group.status === "refused") return group;
    records.push(...group.result);
  }
  const cohort = ParsedMetaRecordSchema.parse(primary.fields).cohort?.split("/").at(-1);
  if (cohort !== undefined) {
    const doc = await store.read({ reference: recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: cohort })) });
    if (doc.status === "refused") return { status: "refused", refusal: memberCohortReadRefusal(primary, doc.refusal) };
    records.push(doc.result);
  }
  return { status: "ok", result: { records, entries: view.result.entries } };
}
function renameSweepRecords(records: readonly StoreRecord[]): StoreRecord[] {
  return records.filter(record => record.reference.kind !== "work-item/cut-map");
}
function renameProjection(records: StoreRecord[], primary: StoreRecord, seeds: readonly Mutation[], rewriteShared: boolean) {
  const contents = new Map(records.map((record) => {
    const seed = seeds.find(write => sameReference(write.reference, record.reference));
    return [record, seed?.action === "put" ? seed.content : record.content] as const;
  }));
  const paths = new Map<string, StoreRecord>();
  for (const record of renameSweepRecords(records)) {
    if (!rewriteShared && !sameOwner(record.reference.owner, primary.reference.owner)) continue;
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
  branch: { prior: BranchLink; next: BranchLink } | undefined, artifactRenames: ReadonlyMap<string, string>, rewriteShared: boolean) {
  let content = proposed ?? record.content;
  const own = record.reference.owner.type !== "person" && subject.primary.reference.owner.type !== "person" && record.reference.owner.uid === subject.primary.reference.owner.uid;
  if (record.reference.kind === "cohort/document") content = rewriteCohortMemberHeading(content, subject.originName, targetSlug);
  if (record.reference.kind === "work-item/meta" && (own || rewriteShared)) content = renameMeta(content, subject.originName, targetSlug, own, artifactRenames);
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
function malformed(primary: StoreRecord, condition: string,
  remedy: Remedy = { text: "Repair the reported rename condition or choose an unused work-unit name, then retry." }): StoreResult<never> {
  return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: primary.reference, rule: "lifecycle.rename",
    condition, remedy } };
}

async function checkSharedPairedReferences(store: Store, records: readonly StoreRecord[], primary: StoreRecord,
  artifactRenames: ReadonlyMap<string, string>, source: string, target: string): Promise<StoreResult<never> | undefined> {
  const shared = renameSweepRecords(records).filter((record) => !sameOwner(record.reference.owner, primary.reference.owner));
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
