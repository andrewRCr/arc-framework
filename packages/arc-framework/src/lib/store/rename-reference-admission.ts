/** Revalidate rename participants and reference authority inside the backend's atomic write admission. */
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import { rewriteBacktickedArtifactReferences } from "../work-unit/rename-reference-sweep.js";
import { findAmbiguousPairedReference } from "../work-unit/paired-reference-owners.js";
import { sameOwner, sameReference, OwnerIdentitySchema, recordReferences } from "./identity.js";
import type { StoreRecord } from "./read.js";
import type { BrokenRule, WriteCheckInput } from "./write-check.js";
import { brokenRule, observeRecord, observeRecords, type RuleObservation } from "./kinds/rule-support.js";
import { parseCohortDocument } from "./kinds/cohort/parser.js";
import { rewriteCohortFilenameReferences } from "./kinds/cohort/filename-reference-writer.js";
import { rewriteCohortMemberHeading } from "./kinds/cohort/member-heading-writer.js";
import { resolveRenameReferences } from "./rename-reference-resolution.js";
import { ownedArtifactRenames } from "./rename-artifact-names.js";
import { planRenameMemberHeading } from "./rename-member-heading.js";
import { readLifecycleView } from "./lifecycle-view.js";
import { observeAllHoldings } from "./kinds/cohort/check-support.js";

interface RenameAdmission {
  input: WriteCheckInput;
  primary: StoreRecord;
  target: string;
  artifacts: ReadonlyMap<string, string>;
}

/** Admit prepared participants and cross-owner rewrites against the locked before view. */
export async function checkRenameReferences(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  if (input.writer.kind !== "verb" || input.writer.verb !== "rename" || input.prior === undefined || input.next === undefined) return [];
  const fail = (condition: string): readonly BrokenRule[] => [brokenRule("rename.references", condition,
    "Read the current name and membership evidence, prepare the rename again, and retry; no rename mutations were published.")];
  const prior = await observeRecord(input.before, input.reference), next = await observeRecord(input.after, input.reference);
  if (prior.status !== "known" || next.status !== "known") return fail("Rename identity evidence is unavailable.");
  if (prior.value.reference.owner.name === next.value.reference.owner.name) return [];
  const primary = prior.value, target = next.value.reference.owner.name;
  const captured = await renameReferenceRecords(input, primary);
  if (captured.status !== "known") return fail(captured.status === "unavailable" ? captured.condition : "Rename reference evidence is absent.");
  const own = await observeRecords(input.before, { family: primary.reference.owner.type === "cohort" ? "cohort" : "work-item", owner: primary.reference.owner });
  if (own.status !== "known") return fail(own.status === "unavailable" ? own.condition : "The renamed owner's records are absent.");
  const context: RenameAdmission = { input, primary, target,
    artifacts: primary.reference.owner.type === "cohort" ? new Map() : ownedArtifactRenames(own.value, primary, target) };
  const participants = [...captured.value, ...own.value.filter(record => record.reference.kind !== "work-item/cut-map")];
  const problem = await participantProblem(context, participants) ?? await sharedRecordsProblem(context, captured.value);
  return problem === null ? [] : fail(problem);
}

async function participantProblem(context: RenameAdmission, records: readonly StoreRecord[]): Promise<string | null> {
  const observed = await unpreparedParticipants(context, records);
  if (observed.status !== "known") return observed.status === "unavailable" ? observed.condition : "Rename participants are unavailable.";
  const uncaptured = observed.value;
  if (uncaptured.length === 0) return null;
  if (context.primary.reference.owner.type === "cohort") {
    const problem = await holdingParticipantsProblem(context, uncaptured);
    if (problem !== null) return problem;
  }
  if (!uncaptured.some(record => sharedParticipant(context, record))) return null;
  const resolution = await resolveRenameReferences(context.input.before, context.primary.reference, context.primary.reference.owner.name);
  if (resolution.status === "refused") return resolution.refusal.condition;
  return resolution.result === "other" ? null : "The rename's required reference participants changed after preparation.";
}

async function unpreparedParticipants(context: RenameAdmission, records: readonly StoreRecord[]): Promise<RuleObservation<readonly StoreRecord[]>> {
  const uncaptured: StoreRecord[] = [];
  for (const record of records) {
    if (context.input.observations.some(item => item.expected !== null && sameReference(item.reference, record.reference))) continue;
    const proposed = await observeRecord(context.input.after, record.reference);
    if (proposed.status !== "known") return { status: "unavailable", condition: "A shared rename participant became unavailable." };
    if (proposed.value.content === record.content) uncaptured.push(record);
  }
  return { status: "known", value: uncaptured };
}

async function holdingParticipantsProblem(context: RenameAdmission, records: readonly StoreRecord[]): Promise<string | null> {
  const holdings = await observeAllHoldings(context.input.before, context.primary.reference);
  if (holdings.status !== "known") return holdings.status === "unavailable" ? holdings.condition : "Cohort holdings are unavailable.";
  const participants = holdings.value.flatMap(holding => [holding.candidate.reference,
    ...holding.members.map(member => member.candidate.reference)]);
  return records.some(record => participants.some(reference => sameReference(reference, record.reference)))
    ? "The cohort rename's required membership participants changed after preparation." : null;
}

function sharedParticipant(context: RenameAdmission, record: StoreRecord): boolean {
  const cohort = context.primary.reference.owner.type === "cohort";
  if (record.reference.kind === "cohort/document") return cohort && record.placement?.kind !== "completed"
    && hasFilenameReference(context, record.content);
  if (record.reference.kind !== "work-item/meta") return hasFilenameReference(context, record.content);
  const fields = ParsedMetaRecordSchema.safeParse(record.fields);
  if (!fields.success) return true;
  const source = context.primary.reference.owner.name;
  if (!cohort && (fields.data.dependsOn.includes(source)
    || fields.data.pause?.waitsOn?.kind === "work-unit" && fields.data.pause.waitsOn.slug === source)) return true;
  return record.placement?.kind === "backlog" && fields.data.state === "Planning" && hasFilenameReference(context, record.content);
}

function hasFilenameReference(context: RenameAdmission, content: string): boolean {
  return [...content.matchAll(/`[^`\r\n]+`/gu)].some(match => rewriteFilename(context, match[0]) !== match[0]);
}

async function sharedRecordsProblem(context: RenameAdmission, records: readonly StoreRecord[]): Promise<string | null> {
  for (const record of records) {
    if (sameOwner(record.reference.owner, context.primary.reference.owner)) continue;
    const proposed = await observeRecord(context.input.after, record.reference);
    if (proposed.status !== "known") return proposed.status === "unavailable" ? proposed.condition : "A shared rename record disappeared.";
    if (proposed.value.content === record.content) continue;
    const problem = await sharedReferenceProblem(context, record, proposed.value);
    if (problem !== null) return problem;
  }
  return null;
}

async function renameReferenceRecords(input: WriteCheckInput, primary: StoreRecord): Promise<RuleObservation<readonly StoreRecord[]>> {
  const metas = await observeRecords(input.before, { family: "work-item", kind: "work-item/meta" });
  if (metas.status !== "known") return metas;
  const stubs = await stubReferenceRecords(input, metas.value, primary);
  if (stubs.status !== "known") return stubs;
  const records = [...metas.value, ...stubs.value];
  if (primary.reference.owner.type === "cohort") {
    const cohorts = await observeRecords(input.before, { family: "cohort", kind: "cohort/document" });
    if (cohorts.status !== "known") return cohorts;
    records.push(...cohorts.value);
  } else {
    const fields = ParsedMetaRecordSchema.safeParse(primary.fields);
    if (!fields.success) return { status: "unavailable", condition: "The renamed meta cannot be parsed." };
    const leaf = fields.data.cohort?.split("/").at(-1);
    if (leaf !== undefined) {
      const document = await observeRecord(input.before, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: leaf })));
      if (document.status !== "known") return document;
      records.push(document.value);
    }
  }
  return { status: "known", value: records.filter((record, index) => !records.slice(0, index).some(other => sameReference(other.reference, record.reference))) };
}

async function stubReferenceRecords(input: WriteCheckInput, metas: readonly StoreRecord[], primary: StoreRecord): Promise<RuleObservation<readonly StoreRecord[]>> {
  const records: StoreRecord[] = [];
  for (const meta of metas) {
    if (sameOwner(meta.reference.owner, primary.reference.owner) || meta.placement?.kind !== "backlog") continue;
    const fields = ParsedMetaRecordSchema.safeParse(meta.fields);
    if (!fields.success) return { status: "unavailable", condition: "A shared rename meta cannot be parsed." };
    if (fields.data.state !== "Planning") continue;
    const group = await observeRecords(input.before, { family: "work-item", owner: meta.reference.owner });
    if (group.status !== "known") return group;
    records.push(...group.value.filter(record => record.reference.kind !== "work-item/cut-map"));
  }
  return { status: "known", value: records };
}

async function sharedReferenceProblem(context: RenameAdmission, prior: StoreRecord, next: StoreRecord): Promise<string | null> {
  const { primary, input } = context, source = primary.reference.owner.name;
  const cohort = primary.reference.owner.type === "cohort";
  if (changedFilename(context, prior.content, next.content) || (!cohort && changedWorkItemEdge(prior, next, source))) {
    const resolution = await resolveRenameReferences(input.before, primary.reference, source);
    if (resolution.status === "refused") return resolution.refusal.condition;
    if (resolution.result !== "subject") return `Shared references to '${source}' no longer name only the renamed owner.`;
  }
  if (cohort) return cohortPathProblem(context, prior, next);
  const paired = await pairedFilenameProblem(context, prior, next);
  if (paired !== null) return paired;
  return memberHeadingProblem(context, prior, next);
}

async function memberHeadingProblem(context: RenameAdmission, prior: StoreRecord, next: StoreRecord): Promise<string | null> {
  const { primary, input, target } = context, source = primary.reference.owner.name;
  if (prior.reference.kind !== "cohort/document" || !removedText(prior.content, next.content,
    line => rewriteCohortMemberHeading(line, source, target))) return null;
  const view = await readLifecycleView(input.before);
  if (view.status === "refused") return view.refusal.condition;
  const listing = view.result.listing;
  if (listing.status !== "complete" || listing.missed || listing.diagnostics.length > 0) return "Member-heading ownership evidence is incomplete.";
  const heading = await planRenameMemberHeading(input.before, { primary, records: [prior], entries: view.result.entries, source, target });
  return heading.status !== "known" ? heading.status === "unavailable" ? heading.condition : "Member-heading ownership evidence is absent."
    : heading.value.rewrite ? null : `The member heading '${source}' is also held by another work item.`;
}

async function pairedFilenameProblem(context: RenameAdmission, prior: StoreRecord, next: StoreRecord): Promise<string | null> {
  if (!changedFilename(context, prior.content, next.content)) return null;
  const ambiguity = await findAmbiguousPairedReference(context.input.before, [prior], filename => {
    const token = `\`${filename}\``;
    return rewriteFilename(context, token) !== token && removedToken(prior.content, next.content, token);
  });
  if (ambiguity.status === "refused") return ambiguity.refusal.condition;
  return ambiguity.result === null ? null : `Shared artifact reference '${ambiguity.result.filename}' has multiple owner interpretations.`;
}

function changedFilename(context: RenameAdmission, prior: string, next: string): boolean {
  return removedText(prior, next, token => rewriteFilename(context, token));
}

function rewriteFilename(context: RenameAdmission, token: string): string {
  const source = context.primary.reference.owner.name;
  if (context.primary.reference.owner.type === "cohort") return rewriteCohortFilenameReferences(token, source, context.target);
  const exact = context.artifacts.get(token.slice(1, -1));
  return exact === undefined ? rewriteBacktickedArtifactReferences(token, source, context.target) : `\`${exact}\``;
}

function removedToken(prior: string, next: string, token: string): boolean {
  return next.split(token).length < prior.split(token).length;
}

function removedText(prior: string, next: string, rewrite: (token: string) => string): boolean {
  const tokens = new Set([...prior.matchAll(/`[^`\r\n]+`/gu)].map(match => match[0]).filter(token => rewrite(token) !== token));
  const rewritten = rewrite(prior).split(/\r?\n/u);
  for (const [index, line] of prior.split(/\r?\n/u).entries()) if (rewritten[index] !== line) tokens.add(line);
  return [...tokens].some(token => removedToken(prior, next, token));
}

function changedWorkItemEdge(prior: StoreRecord, next: StoreRecord, source: string): boolean {
  if (prior.reference.kind !== "work-item/meta") return false;
  const before = ParsedMetaRecordSchema.safeParse(prior.fields), after = ParsedMetaRecordSchema.safeParse(next.fields);
  if (!before.success || !after.success) return true;
  return before.data.dependsOn.includes(source) && !after.data.dependsOn.includes(source)
    || before.data.pause?.waitsOn?.kind === "work-unit" && before.data.pause.waitsOn.slug === source
      && (after.data.pause?.waitsOn?.kind !== "work-unit" || after.data.pause.waitsOn.slug !== source);
}

async function cohortPathProblem(context: RenameAdmission, prior: StoreRecord, next: StoreRecord): Promise<string | null> {
  const before = cohortPath(prior), after = cohortPath(next);
  if (before === after) return null;
  if (before === undefined || after === undefined || before === null || after === null) return "A shared cohort path was cleared or became unreadable during rename.";
  const oldParts = before.split("/"), newParts = after.split("/");
  if (oldParts.length !== newParts.length) return "A shared cohort path changed its nesting during rename.";
  for (const [index, name] of oldParts.entries()) {
    if (name === newParts[index]) continue;
    const observed = await context.input.before.read({ reference: recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name })) });
    if (observed.status === "refused") return observed.refusal.condition;
    const expected = sameOwner(observed.result.reference.owner, context.primary.reference.owner) ? context.target : observed.result.reference.owner.name;
    if (newParts[index] !== expected) return `The cohort path segment '${name}' no longer grants this rename its prepared rewrite.`;
  }
  return null;
}

function cohortPath(record: StoreRecord): string | null | undefined {
  if (record.reference.kind === "work-item/meta") {
    const parsed = ParsedMetaRecordSchema.safeParse(record.fields);
    return parsed.success ? parsed.data.cohort : undefined;
  }
  if (record.reference.kind === "cohort/document") {
    const parsed = parseCohortDocument(record.content);
    return parsed.success ? parsed.data.parent : undefined;
  }
  return undefined;
}
