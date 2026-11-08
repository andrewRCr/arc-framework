/** Atomic rename preparation over whole record groups and the shared reference sweep. */
import { posix } from "node:path";
import { SlugSchema } from "../kernel/index.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import { ParsedMetaRecordSchema, MetaPauseSchema } from "../active/meta-schema.js";
import { recordReferences, OwnerIdentitySchema, RecordReferenceSchema, sameReference, sameOwner } from "./identity.js";
import { readLifecycleView } from "./lifecycle-view.js";
import { requireCompleteInventory } from "./lifecycle-storage.js";
import { recordPut, mergeLifecycleLinks, batchLifecycleWrites } from "./lifecycle-write.js";
import { acquireLifecycleRecords, revalidateLifecycleRecords, type PreparedLifecycleWrite } from "../work-unit/prepared-lifecycle-write.js";
import { findAmbiguousPairedReference } from "../work-unit/paired-reference-owners.js";
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
import type { BatchResult, Mutation, RecordObservation } from "./write.js";
import type { LifecycleEntry } from "./lifecycle-index.js";
import { readRenameResolution } from "./rename-reference-resolution.js";
import type { LookupResult } from "./lookup.js";
import { workUnitRenameReferenceReport, workUnitRenameReportObservations } from "./rename-reference-report.js";
import type { RenameReport } from "../work-unit/rename-report.js";
import { planRenameMemberHeading } from "./rename-member-heading.js";
import { ownedArtifactRenames, renameSweepFilename } from "./rename-artifact-names.js";
/** The store reads a rename's preparation makes; admission supplies the same reads over the state a batch lands on. */
export type RenamePlanView = Pick<Store, "read" | "list" | "lookup" | "history" | "capabilities">;
/** Selected subject, reporting advisories, and the records and absences the selection read. */
export interface StoreRenameSubject {
  primary: StoreRecord; operand: string; resuming: boolean; originName: string; advisories: string[];
  evidence: readonly RecordObservation[];
}
/** The branch link a rename would move, and whether this machine's checkout of the subject holds it. */
export interface RenameBranchInput { prior: BranchLink; next: BranchLink; checkoutHere: boolean }
/** The link's holders as preparation read them, and whether the batch moves the link. */
export interface RenameBranchPlan { local: boolean; ownership: StoreResult<LookupResult>; holderCompleted: boolean }
/** Complete acquisition, expected-version writes, and the evidence the batch observes. */
export interface PreparedStoreRename extends PreparedLifecycleWrite {
  subject: StoreRenameSubject; report: RenameReport; branch?: RenameBranchPlan;
}
/** Read a complete inventory, admit the target by creation rules, and recover a prior rename's original name.
 * @param store - Operational state contract.
 * @param request - Selected primary, original operand, and proposed current name.
 * @returns Selected primary, coordination advisories, and the Candidate absence and Integrating dependents it read, or
 *   exact store refusal.
 */
export async function readStoreRenameSubject(store: RenamePlanView, request: { primary: StoreRecord; operand: string; targetSlug: string }): Promise<StoreResult<StoreRenameSubject>> {
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
  if (publication.status === "refused") return publication;
  const origin = resuming ? await renameOrigin(store, primary, primary.reference.owner.name) : { status: "ok" as const, result: primary.reference.owner.name };
  if (origin.status === "refused") return origin;
  if (resuming && origin.result === target) return malformed(primary, "Rename needs distinct source and target names.");
  const dependents = view.result.entries.filter((entry) => entry.fields.state === "Integrating" && entry.fields.dependsOn.includes(origin.result));
  const evidence = [...publication.result];
  for (const entry of dependents) {
    const dependent = await store.read({ reference: entry.reference }); if (dependent.status === "refused") return dependent;
    evidence.push(...observeRecords([dependent.result]));
  }
  const advisories = dependents.map((entry) => `Work unit \`${entry.reference.owner.name}\` is Integrating with a live \`Depends On\` edge to \`${origin.result}\`. Coordinate before transforming the origin; this transform will not mutate that dependent.`);
  return { status: "ok", result: { primary, operand: request.operand, resuming, originName: origin.result, advisories, evidence } };
}

async function checkRenamePublication(store: Pick<Store, "read" | "capabilities">, primary: StoreRecord, resuming: boolean,
  legacyCandidateId: string | null): Promise<StoreResult<RecordObservation[]>> {
  if (resuming) return { status: "ok", result: [] };
  if (!store.capabilities.stateOffBranch) return primary.placement?.kind !== "completed" && legacyCandidateId !== null
    ? malformed(primary, "A work unit with Candidate publication state cannot be renamed.") : { status: "ok", result: [] };
  const reference = recordReferences["review/candidate"](primary.reference.owner);
  const candidate = await store.read({ reference });
  if (candidate.status === "ok") return malformed(primary, "A work unit with Candidate publication state cannot be renamed.");
  return candidate.refusal.code === "not-found" ? { status: "ok", result: [{ reference, expected: null }] } : candidate;
}
async function renameOrigin(store: Pick<Store, "history">, primary: StoreRecord, fallback: string): Promise<StoreResult<string>> {
  const history = await store.history({ reference: primary.reference }); if (history.status === "refused") return history;
  const previous = history.result.find((entry) => entry.reference.kind === "work-item/meta" && entry.reference.owner.name !== primary.reference.owner.name);
  return { status: "ok", result: previous?.reference.owner.name ?? fallback };
}
/** Prepare a rename from a store view alone: the subject's admission, then its complete batch.
 * @param view - The store reads preparation makes.
 * @param request - Selected primary, original operand, proposed name, and any branch link the batch moves.
 * @returns The batch preparation would submit, or the refusal preparation would return.
 */
export async function planStoreRename(view: RenamePlanView, request: { primary: StoreRecord; operand: string; target: string;
  branch?: RenameBranchInput }): Promise<StoreResult<PreparedStoreRename>> {
  const subject = await readStoreRenameSubject(view, { primary: request.primary, operand: request.operand, targetSlug: request.target });
  if (subject.status === "refused") return subject;
  if (subject.result.resuming) return malformed(request.primary, "A completed rename has no batch to prepare.");
  return prepareStoreRename(view, subject.result, request.target, request.branch);
}
/** Prepare the owned record group, shared stubs, and exact cohort member edits as one batch.
 * @param store - The store reads preparation makes.
 * @param subject - Collision-checked subject and its original canonical name.
 * @param targetSlug - New display name on the same UID.
 * @param branch - The branch link the rename would move, when the subject has one.
 * @returns Every acquired record, its proposed writes, and the evidence the batch observes.
 */
export async function prepareStoreRename(store: RenamePlanView, subject: StoreRenameSubject, targetSlug: string,
  branch?: RenameBranchInput): Promise<StoreResult<PreparedStoreRename>> {
  const groups = await acquireRenameGroups(store, subject.primary); if (groups.status === "refused") return groups;
  const basis = await revalidateLifecycleRecords(store, [subject.primary]); if (basis.status === "refused") return basis;
  const records = groups.result.records;
  const resolution = await readRenameResolution(store, subject.primary.reference, subject.originName);
  if (resolution.status === "refused") return resolution;
  const heading = await planRenameMemberHeading(store, { primary: subject.primary, records, entries: groups.result.entries,
    source: subject.originName, target: targetSlug });
  if (heading.status !== "known") return malformed(subject.primary,
    `Member heading ownership is unavailable. ${heading.status === "unavailable" ? heading.condition : "Cohort holding evidence is absent."}`,
    { text: "Restore readable cohort membership evidence, then retry rename.", argv: ["arc", "rename", subject.operand, targetSlug] });
  const authority = { shared: resolution.result.resolution === "subject", memberHeading: heading.value.rewrite };
  const settlement = await settleCreationSlugEdges(store, targetSlug, subject.primary.reference.owner);
  const unseen = settlement.writes.filter(write => !records.some(record => sameReference(record.reference, write.reference)));
  if (unseen.length > 0) return { status: "refused", refusal: { code: "version-conflict", class: "recoverable",
    records: unseen.map(write => write.reference), condition: "The set of backlog records changed during rename preparation.",
    remedy: { text: "Acquire the complete rename groups again, then retry.", argv: ["arc", "rename", subject.operand, targetSlug] } } };
  const own = await settleOwnRenameEdge(store, subject, targetSlug); if (own.status === "refused") return own;
  const holders = branch === undefined ? undefined : await planBranchMove(store, subject.primary, branch);
  if (holders?.status === "refused") return holders;
  const artifactRenames = ownedArtifactRenames(records, subject.primary, targetSlug);
  const ambiguity = authority.shared
    ? await checkSharedPairedReferences(store, records, subject.primary, artifactRenames, subject.originName, targetSlug) : undefined;
  if (ambiguity !== undefined) return ambiguity;
  const virtual = renameProjection(records, subject.primary, [...settlement.writes, ...own.result.writes], authority.shared);
  const sweep = await planRenameReferences({ arcRoot: ".arc", sourceSlug: subject.originName, targetSlug, artifactRenames }, virtual.context);
  await applyRenameReferencePlan(sweep, virtual.context);
  const moved = holders?.result.plan.local === true ? branch : undefined;
  const writes = records.flatMap((record) => renameMutation(record, subject, targetSlug, virtual.contents.get(record), moved, artifactRenames,
    authority));
  const retained = records.map(record => {
    const write = writes.find(item => sameReference(item.reference, record.reference));
    return write?.action === "put" ? { ...record, content: write.content } : record;
  });
  const report = { ...workUnitRenameReferenceReport({ primary: subject.primary, records: retained, entries: groups.result.entries,
    resolution: resolution.result.resolution, source: subject.originName, target: targetSlug, artifactRenames }), memberHeadings: heading.value.edits };
  const written = records.filter(record => writes.some(write => sameReference(write.reference, record.reference)));
  const observations = mergeRenameObservations([...observeRecords(written), ...subject.evidence, ...groups.result.observations,
    ...heading.value.observations, ...settlement.observations, ...own.result.observations, ...resolution.result.evidence,
    ...(holders?.result.evidence ?? []), ...workUnitRenameReportObservations({ records, entries: groups.result.entries }, report)],
  subject, targetSlug);
  if (observations.status === "refused") return observations;
  return { status: "ok", result: { subject, records, writes, observations: observations.result, report,
    ...(holders === undefined ? {} : { branch: holders.result.plan }) } };
}
/** Submit a prepared rename: exactly its writes, observing its evidence, under the rename verb's provenance.
 * @param store - Operational store.
 * @param prepared - The rename's preparation.
 * @returns The landed batch, or the store's refusal.
 */
export function submitStoreRename(store: Store, prepared: PreparedStoreRename): Promise<StoreResult<BatchResult>> {
  return batchLifecycleWrites(store, prepared.writes, { verb: "rename", lifecycleAction: "rename" }, prepared.observations);
}
/** Read the branch link's holders: the link moves when the subject holds it or this machine's checkout does. */
async function planBranchMove(store: Pick<Store, "read" | "lookup">, primary: StoreRecord, branch: RenameBranchInput): Promise<StoreResult<{
  plan: RenameBranchPlan; evidence: RecordObservation[];
}>> {
  const ownership = await store.lookup({ kind: "ref", repository: branch.prior.repository, ref: branch.prior.ref });
  const holders = ownership.status === "ok" ? [ownership.result.reference]
    : ownership.refusal.code === "ambiguous-match" ? ownership.refusal.candidates : [];
  const others: StoreRecord[] = [];
  for (const reference of holders) {
    if (sameOwner(reference.owner, primary.reference.owner)) continue;
    const holder = await store.read({ reference }); if (holder.status === "refused") return holder;
    others.push(holder.result);
  }
  const own = ownership.status === "ok" && sameOwner(ownership.result.reference.owner, primary.reference.owner);
  const holderCompleted = ownership.status === "ok" && !own && others[0]?.placement?.kind === "completed";
  return { status: "ok", result: { plan: { local: own || branch.checkoutHere, ownership, holderCompleted }, evidence: observeRecords(others) } };
}
async function settleOwnRenameEdge(store: Pick<Store, "read" | "lookup">, subject: StoreRenameSubject, target: string): Promise<StoreResult<CreationSlugSettlement>> {
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
async function acquireRenameGroups(store: RenamePlanView, primary: StoreRecord): Promise<StoreResult<{
  records: StoreRecord[]; entries: readonly LifecycleEntry[]; observations: RecordObservation[];
}>> {
  const own = await acquireLifecycleRecords(store, primary.reference); if (own.status === "refused") return own;
  const records = [...own.result];
  const view = await readLifecycleView(store); if (view.status === "refused") return view;
  requireCompleteInventory(store, view.result.listing);
  for (const entry of view.result.entries) {
    if (entry.placement.kind !== "backlog" || entry.fields.state !== "Planning" || sameReference(entry.reference, primary.reference)) continue;
    const group = await acquireLifecycleRecords(store, entry.reference); if (group.status === "refused") return group;
    records.push(...group.result);
  }
  const cohorts = await acquireRenameCohorts(store, primary); if (cohorts.status === "refused") return cohorts;
  const leaf = cohorts.result.at(-1);
  if (leaf !== undefined) records.push(leaf);
  return { status: "ok", result: { records, entries: view.result.entries, observations: observeRecords(cohorts.result.slice(0, -1)) } };
}
async function acquireRenameCohorts(store: Pick<Store, "read">, primary: StoreRecord): Promise<StoreResult<StoreRecord[]>> {
  const records: StoreRecord[] = [];
  for (const cohort of ParsedMetaRecordSchema.parse(primary.fields).cohort?.split("/") ?? []) {
    const doc = await store.read({ reference: recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: cohort })) });
    if (doc.status === "refused") return { status: "refused", refusal: memberCohortReadRefusal(primary, doc.refusal) };
    records.push(doc.result);
  }
  return { status: "ok", result: records };
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
    const filename = renameSweepFilename(records, primary, record);
    // The sweep reads only the tier and the filename; the owner's UID keeps two stubs that share a name apart.
    const path = posix.join(".arc", "active", sweepDirectory(record.reference.owner), filename);
    paths.set(path, record);
  }
  return { contents, context: {
    listFiles: () => Promise.resolve([...paths.keys()].map((path) => path.slice(".arc/".length))),
    readFile: (path: string) => { const record = paths.get(path); if (record === undefined) throw new Error(`Unacquired rename path ${path}`); return Promise.resolve(contents.get(record) ?? record.content); },
    writeFile: (path: string, content: string) => { const record = paths.get(path); if (record === undefined) throw new Error(`Unacquired rename path ${path}`); contents.set(record, content); return Promise.resolve(); },
  } };
}
function sweepDirectory(owner: StoreRecord["reference"]["owner"]): string {
  return owner.type === "person" || owner.uid === undefined ? owner.name : `${owner.name}~${owner.uid}`;
}
function renameMutation(record: StoreRecord, subject: StoreRenameSubject, targetSlug: string, proposed: string | undefined,
  branch: { prior: BranchLink; next: BranchLink } | undefined, artifactRenames: ReadonlyMap<string, string>, authority: { shared: boolean; memberHeading: boolean }) {
  let content = proposed ?? record.content;
  const own = record.reference.owner.type !== "person" && subject.primary.reference.owner.type !== "person" && record.reference.owner.uid === subject.primary.reference.owner.uid;
  if (record.reference.kind === "cohort/document" && authority.memberHeading) content = rewriteCohortMemberHeading(content, subject.originName, targetSlug);
  if (record.reference.kind === "work-item/meta" && (own || authority.shared)) content = renameMeta(content, subject.originName, targetSlug, own, artifactRenames);
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

async function checkSharedPairedReferences(store: Pick<Store, "lookup">, records: readonly StoreRecord[], primary: StoreRecord,
  artifactRenames: ReadonlyMap<string, string>, source: string, target: string): Promise<StoreResult<never> | undefined> {
  const shared = renameSweepRecords(records).filter((record) => !sameOwner(record.reference.owner, primary.reference.owner));
  const ambiguity = await findAmbiguousPairedReference(store, shared, filename => {
    const reference = `\`${filename}\``;
    return artifactRenames.has(filename) || rewriteBacktickedArtifactReferences(reference, source, target) !== reference;
  });
  if (ambiguity.status === "refused") return ambiguity;
  if (ambiguity.result === null) return undefined;
  const { filename, owners } = ambiguity.result;
  return malformed(primary, `Ambiguous artifact reference ${filename}: possible owners ${owners.map((owner) => owner.subject).join(", ")}. Disambiguate the shared reference before retrying rename.`);
}
