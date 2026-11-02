/** Session-notes inputs and freshness for work-unit context compilation. */

import { resolvePlanningStage } from "../../lib/active/current-workflow-consistency.js";
import { resolveLoadSetManifest, type LoadSetSessionType } from "../../lib/load-set/projection.js";
import { readSessionNotesFields } from "../../lib/store/session-notes-fields.js";
import { parseLifecycleMetaContent } from "../../lib/store/lifecycle-meta-content.js";
import type { AgendaCompileInput } from "./compile-input.js";
import { compileResumeReads, selectedAgendaContext, type AgendaResumeReadContext, type AgendaReadOptions } from "./reads.js";
import type { AgendaStep } from "./schema.js";

type Note = Extract<AgendaStep, { type: "note" }>;

/** Context reads and metadata retained for orientation decisions. */
export interface AgendaResumeContext { steps: AgendaStep[]; metaContent: string | null }
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
export async function compileResumeContext(input: AgendaCompileInput, options: AgendaReadOptions = {}): Promise<AgendaResumeContext> {
  const context = selectedAgendaContext(input);
  if (context === null) return { steps: [], metaContent: null };
  const metaContent = await optionalContent(input, context.metaPath);
  const notesPath = context.loadSet.entries.find(entry => isDocument(entry.path, "SESSION-NOTES.md"))?.path;
  const notes = readSessionNotesFields(await optionalContent(input, notesPath) ?? "");
  const authored = notes.sessionType;
  const override = resolveAgendaSessionType(context.sessionType, authored);
  const effective = override.warning === null && authored !== null
    ? overriddenContext(input, override.sessionType, metaContent ?? "") : context;
  const steps = await compileResumeReads(input, effective, options);
  if (override.warning !== null) steps.push(override.warning);
  const freshness = await compileHandoffFreshness(input, notes.commitAtHandoff, context.metaPath);
  if (freshness !== null) steps.push(freshness);
  return { steps, metaContent };
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
