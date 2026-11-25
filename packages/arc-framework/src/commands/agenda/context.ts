/** Handoff fields and freshness for work-unit context compilation, from SESSION-NOTES or, off the branch, the meta. */

import { resolvePlanningStage } from "../../lib/active/current-workflow-consistency.js";
import { resolveLoadSetManifest, type LoadSetSessionType } from "../../lib/load-set/projection.js";
import { readSessionNotesFields } from "../../lib/store/session-notes-fields.js";
import { parseLifecycleMetaContent } from "../../lib/store/lifecycle-meta-content.js";
import type { DerivedWorkUnitSubject } from "../../lib/locus/role-derivation.js";
import { familyOf, type FamilyId } from "../../lib/store/catalog.js";
import type { HistoryEntry, Store } from "../../lib/store/contract.js";
import { OwnerIdentitySchema, recordReferences, sameReference, type RecordReference, type StateVersion } from "../../lib/store/identity.js";
import type { StoreRefusal } from "../../lib/store/refusal.js";
import { FAMILY_REGISTRY } from "../../lib/store/registry.js";
import type { AgendaCompileInput } from "./compile-input.js";
import { compileResumeReads, renderCheckoutHistory, selectedAgendaContext, type AgendaResumeReadContext } from "./reads.js";
import type { AgendaStep } from "./schema.js";

type Note = Extract<AgendaStep, { type: "note" }>;
type ResolvedContext = NonNullable<ReturnType<typeof selectedAgendaContext>>;

/**
 * The handoff fields one compile reads: SESSION-NOTES in the in-repo implementation, the meta off the branch, where
 * a meta recording no session context takes the checkout's history in its place.
 */
interface HandoffFields {
  metaContent: string | null;
  sessionType: string | null;
  sessionContextAbsent: boolean;
  freshness: () => Promise<Note | null>;
}

/** Context reads and metadata retained for orientation decisions. */
export interface AgendaResumeContext { steps: AgendaStep[]; metaContent: string | null; projectedMetaContent: string | null }
/** An effective session type and any ignored-override warning. */
export interface AgendaSessionType { sessionType: LoadSetSessionType | null; warning: Note | null }

/** Resolve the bounded override without changing lifecycle-determined phases. */
export function resolveAgendaSessionType(current: LoadSetSessionType | null, authored: string | null): AgendaSessionType {
  const value = authored?.trim().toLowerCase();
  if (value === undefined || value === "" || value === "[none]") return { sessionType: current, warning: null };
  if ((current === "planning" || current === "execution") && (value === "planning" || value === "execution")) {
    return { sessionType: value, warning: null };
  }
  return { sessionType: current, warning: { type: "note", surface: "session-type-override",
    text: `Ignored Session Type override '${authored}' over ${current ?? "an unresolved phase"}; only planning and execution may override each other.` } };
}

/** Read current session fields before compiling their effective context. */
export async function compileResumeContext(input: AgendaCompileInput): Promise<AgendaResumeContext> {
  const context = selectedAgendaContext(input);
  if (context === null) return { steps: [], metaContent: null, projectedMetaContent: null };
  const projectedMetaContent = input.signals.next || input.entry.store?.capabilities.stateOffBranch !== true
    ? await optionalContent(input, context.metaPath) : null;
  const fields = await readHandoffFields(input, context, projectedMetaContent);
  const { metaContent, sessionType: authored } = fields;
  const override = resolveAgendaSessionType(context.sessionType, authored);
  const effective = override.warning === null && authored !== null
    ? overriddenContext(input, override.sessionType, metaContent ?? "") : context;
  const steps = await compileResumeReads(input, effective);
  if (fields.sessionContextAbsent) {
    const meta = steps.findIndex(step => step.type === "read" && step.path === context.metaPath);
    steps.splice(meta < 0 ? steps.length : meta + 1, 0, await renderCheckoutHistory(input, "The work unit's meta records no session context."));
  }
  if (override.warning !== null) steps.push(override.warning);
  const freshness = await fields.freshness();
  if (freshness !== null) steps.push(freshness);
  return { steps, metaContent, projectedMetaContent };
}

async function readHandoffFields(input: AgendaCompileInput, context: ResolvedContext, projectedMetaContent: string | null): Promise<HandoffFields> {
  const store = input.entry.store;
  if (store?.capabilities.stateOffBranch !== true) {
    const notesPath = context.loadSet.entries.find(entry => isDocument(entry.path, "SESSION-NOTES.md"))?.path;
    const notes = readSessionNotesFields(await optionalContent(input, notesPath) ?? "");
    return { metaContent: projectedMetaContent, sessionType: notes.sessionType, sessionContextAbsent: false,
      freshness: () => compileHandoffFreshness(input, notes.commitAtHandoff, context.metaPath) };
  }
  const subject = enteringWorkUnit(input);
  const empty = { metaContent: null, sessionType: null, sessionContextAbsent: false };
  if (subject === null) return { ...empty, freshness: () => Promise.resolve(null) };
  const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: subject.key, uid: subject.uid }));
  const read = await store.read({ reference });
  if (read.status === "refused") return { ...empty, freshness: () => Promise.resolve(unavailableFreshness(read.refusal)) };
  const record = read.result;
  const parsed = parseLifecycleMetaContent(record.content);
  const meta = parsed.success ? parsed.data : null;
  return { metaContent: record.content, sessionType: meta?.sessionType ?? null,
    sessionContextAbsent: meta !== null && (meta.sessionContext ?? "").trim() === "",
    freshness: () => compileStateFreshness(store, meta?.stateAtHandoff ?? null, record.reference, input.envelope.identity.identity) };
}

function enteringWorkUnit(input: AgendaCompileInput): DerivedWorkUnitSubject | null {
  const frame = input.envelope.derivedLocusState;
  const subject = frame.ok && frame.value.entering.kind === "selected" ? frame.value.entering.row.subject : null;
  return subject?.kind === "work-unit" ? subject : null;
}

function overriddenContext(input: AgendaCompileInput, sessionType: LoadSetSessionType | null, meta: string): AgendaResumeReadContext | null {
  const context = selectedAgendaContext(input);
  const frame = input.envelope.derivedLocusState;
  if (context === null || !frame.ok || frame.value.entering.kind !== "selected") return null;
  const subject = frame.value.entering.row.subject;
  const workingMemoryPath = context.loadSet.entries.find(entry => isDocument(entry.path, "WORKING-MEMORY.md"))?.path;
  const workUnitStage = sessionType === "execution"
    ? context.taskCursor?.status === "no-open-task" ? "verification-closeout" : "task-work" : null;
  const parsedMeta = parseLifecycleMetaContent(meta);
  return { sessionType, workflow: sessionType === "planning" ? "planning"
    : workUnitStage === "verification-closeout" ? "verify-work-unit" : "process-task-loop",
  loadSet: resolveLoadSetManifest({ identity: input.envelope.identity.identity,
    activeWorkUnit: subject?.kind === "work-unit" ? subject.key : null,
    metaPath: context.metaPath, sessionType, taskListPath: context.taskListPath,
    planningStage: resolvePlanningStage(parsedMeta.success ? parsedMeta.data.currentWorkflow : null, sessionType),
    workUnitStage, workingMemoryPath, cohortDocPath: context.cohortDocPath,
    stateOffBranch: !context.loadSet.entries.some(entry => isDocument(entry.path, "SESSION-NOTES.md")),
  }) };
}

/** Read only the entering work unit's baseline for readiness on another target. */
export async function compileCheckoutFreshness(input: AgendaCompileInput): Promise<Note | null> {
  const frame = input.envelope.derivedLocusState;
  if (!frame.ok || frame.value.entering.kind !== "selected" || frame.value.entering.row.kind !== "work-unit") return null;
  const context = selectedAgendaContext(input);
  if (context === null) return null;
  return (await readHandoffFields(input, context, null)).freshness();
}

type FreshnessStore = Pick<Store, "version" | "changes" | "list">;

/**
 * Compare the meta's recorded handoff state with the store's current version, listing each change since.
 *
 * The handoff write that recorded the baseline lands after it, so it is not a change since the handoff.
 * @param store - The off-branch store the meta lives in.
 * @param baseline - The meta's `State at Handoff`.
 * @param metaReference - The entering work unit's exact meta reference.
 * @param identity - The resuming identity, whose personal history needs a saved lower bound after a handover.
 * @returns A freshness note, or nothing when no change landed since the handoff.
 */
export async function compileStateFreshness(store: FreshnessStore, baseline: StateVersion | null,
  metaReference: RecordReference, identity: string | null): Promise<Note | null> {
  const note = (text: string): Note => ({ type: "note", surface: "freshness-gap", text });
  if (baseline === null) return note("There is no handoff baseline for this session.");
  const current = await store.version();
  if (current.status === "refused") return unavailableFreshness(current.refusal);
  if (current.result === baseline) return null;
  const changes = await store.changes({ from: baseline, to: current.result });
  if (changes.status === "refused") return unavailableFreshness(changes.refusal);
  const handoff = findBaselineWrite(changes.result, baseline, metaReference);
  const handoffOwner = handoff?.owner ?? null;
  const entries = changes.result.filter(entry => entry !== handoff?.entry);
  const since = handoffOwner !== null && identity !== null && handoffOwner !== identity
    ? await boundedHandoverChanges(store, baseline, identity, entries) : entries;
  if (!Array.isArray(since)) return since;
  if (since.length === 0) return null;
  const metaChanged = since.some(entry => isEnteringMeta(entry, metaReference));
  return note(`State changes since handoff ${baseline}:\n${since.map(describeChange).join("\n")}\nMeta changed: ${metaChanged ? "yes" : "no"}.`);
}

async function boundedHandoverChanges(store: FreshnessStore, baseline: StateVersion, identity: string,
  entries: HistoryEntry[]): Promise<HistoryEntry[] | Note> {
  const recipient = OwnerIdentitySchema.parse({ type: "person", name: identity });
  const personal = new Set(entries.filter(({ reference }) => reference.owner.type === "person" && reference.owner.name === identity));
  const bounded = new Set<FamilyId>();
  for (const family of new Set([...personal].map(({ reference }) => familyOf(reference.kind)))) {
    const listing = await store.list({ family, owner: recipient, asOf: baseline });
    if (listing.status === "refused") return unavailableFreshness(listing.refusal);
    if (listing.result.status === "unreadable") return unavailableFreshness(listing.result);
    // A complete listing establishes the recipient's family at the baseline, even for newer records in it.
    if (listing.result.status === "complete") bounded.add(family);
  }
  return entries.filter(entry => {
    const family = familyOf(entry.reference.kind);
    return FAMILY_REGISTRY[family].scope === "project" || (bounded.has(family) && personal.has(entry));
  });
}

function findBaselineWrite(entries: HistoryEntry[], baseline: StateVersion, metaReference: RecordReference): { entry: HistoryEntry; owner: string | null } | null {
  for (const entry of entries) {
    if (!isEnteringMeta(entry, metaReference) || entry.content === null || !("verb" in entry.provenance) || entry.provenance.verb !== "handoff-write") continue;
    const parsed = parseLifecycleMetaContent(entry.content);
    if (parsed.success && parsed.data.stateAtHandoff === baseline) return { entry, owner: parsed.data.owner };
  }
  return null;
}

function isEnteringMeta(entry: HistoryEntry, metaReference: RecordReference): boolean {
  return entry.reference.kind === "work-item/meta" && sameReference(entry.reference, metaReference);
}

function unavailableFreshness(refusal: Pick<StoreRefusal, "condition" | "remedy">): Note {
  return { type: "note", surface: "freshness-gap",
    text: `Freshness cannot be compared. ${refusal.condition}\n${refusal.remedy.text}` };
}

function describeChange(entry: HistoryEntry): string {
  const { kind, owner, key } = entry.reference;
  const by = "verb" in entry.provenance ? ` by ${entry.provenance.verb}` : "";
  return `${kind} ${owner.name}${key === undefined ? "" : ` ${typeof key === "string" ? key : JSON.stringify(key)}`}${entry.version === null ? " (removed)" : ""}${by}`;
}

/** Compare a recorded handoff with the checkout's current commit and history. */
export async function compileHandoffFreshness(input: AgendaCompileInput, baseline: string | null, metaPath: string): Promise<Note | null> {
  const note = (text: string): Note => ({ type: "note", surface: "freshness-gap", text });
  if (baseline === null) return note("There is no handoff baseline for this session.");
  let resolved: string;
  try { resolved = (await input.read.git(["rev-parse", "--verify", "--end-of-options", `${baseline}^{commit}`])).trim(); }
  catch { return note(`The handoff baseline '${baseline}' is unreachable; freshness cannot be compared.`); }
  const frame = input.envelope.derivedLocusState;
  if (frame.ok && frame.value.entering.kind === "selected" && resolved === frame.value.entering.row.checkout.head) return null;
  const commits = await input.read.git(["log", "--oneline", `${resolved}..HEAD`]);
  const changed = await input.read.git(["log", "--format=", "--name-only", `${resolved}..HEAD`, "--", metaPath]);
  return note(`Commits since handoff ${baseline}:\n${commits.trim()}\nMeta changed: ${changed.trim() === "" ? "no" : "yes"}.`);
}

async function optionalContent(input: AgendaCompileInput, path: string | undefined): Promise<string | null> {
  return path !== undefined && await input.read.exists(path) ? input.read.read(path) : null;
}

function isDocument(path: string, name: string): boolean {
  return path.replaceAll("\\", "/").endsWith(`/${name}`);
}
