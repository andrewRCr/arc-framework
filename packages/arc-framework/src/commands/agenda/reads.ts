/** Context-read grouping over the selected session manifest. */

import type { Probe } from "../status/types.js";
import type { SubjectMetaProjection } from "../../lib/locus/subject-meta.js";
import type { LoadSetEntry } from "../../lib/load-set/types.js";
import type { TaskListCursorFileResult } from "../../lib/task-list/file-cursor.js";
import type { TaskListCursor } from "../../lib/task-list/cursor.js";
import type { AgendaCompileInput } from "./compile-input.js";
import { renderDegradedSlot } from "./render.js";
import { compileNotesSync } from "./notes.js";
import type { AgendaStep } from "./schema.js";

/** Maximum aggregate source bytes assigned to one tool-read group. */
export const READ_GROUP_BUDGET_BYTES = 48 * 1024;
/** Context pointers that determine resume reads, including a session-type override. */
export type AgendaResumeReadContext = Pick<Extract<SubjectMetaProjection, { kind: "resolved" }>, "sessionType" | "workflow" | "loadSet">;
/** Cursor authority and any diagnostic that replaces its read. */
export interface AgendaCursorRead { cursor: TaskListCursor | null; note: AgendaStep | null; degraded?: AgendaStep }

/** Read the entering checkout's selected context without scanning for another subject. */
export function selectedAgendaContext(input: AgendaCompileInput): Extract<SubjectMetaProjection, { kind: "resolved" }> | null {
  const slot = input.envelope.derivedLocusState;
  return slot.ok && slot.value.entering.kind === "selected" ? slot.value.entering.row.context : null;
}

/** Select a valid strategic cursor or its diagnostic. */
export function resolveAgendaTaskCursor(slot: Probe<TaskListCursorFileResult> | undefined): AgendaCursorRead {
  if (slot === undefined) return cursorNote("Task cursor is unavailable; task context was not read.");
  if (!slot.ok) {
    const degraded = renderDegradedSlot("taskCursor", slot);
    return { ...cursorNote(`Task cursor ${slot.error.kind}: ${slot.error.message}`),
      ...(degraded === null ? {} : { degraded }) };
  }
  if (slot.value.status === "found") return { cursor: slot.value.cursor, note: null };
  if (slot.value.status === "malformed") return cursorNote(`Task cursor at line ${slot.value.error.line}: ${slot.value.error.message}`);
  return { cursor: null, note: null };
}

function cursorNote(text: string): AgendaCursorRead {
  return { cursor: null, note: { type: "note", surface: "task-cursor", text } };
}

/** Compile existing context documents in manifest order. */
export async function compileResumeReads(
  input: AgendaCompileInput, context: AgendaResumeReadContext | null = selectedAgendaContext(input),
): Promise<AgendaStep[]> {
  if (context === null) return [];
  const steps: AgendaStep[] = [];
  const group = { id: 0, bytes: 0 };
  const entries = [...context.loadSet.entries];
  if (input.envelope.identity.role === "contributor") entries.splice(2, 0, {
    path: ".arc/reference/briefs/AGENT-BRIEF.CONTRIBUTOR.md", readMode: { kind: "full" },
  });
  for (const entry of entries) steps.push(...await compileRead(input, context, entry, group));
  if (context.workflow === null) steps.push({ type: "note", surface: "mismatch", text: "The selected role has no resolved workflow." });
  return steps;
}

async function compileRead(
  input: AgendaCompileInput, context: AgendaResumeReadContext, entry: LoadSetEntry, group: { id: number; bytes: number },
): Promise<AgendaStep[]> {
  const strategic = entry.readMode.kind === "partial-strategic";
  if (strategic && context.sessionType === "planning") return [];
  const { cursor, note, degraded }: AgendaCursorRead = strategic ? resolveAgendaTaskCursor(input.envelope.taskCursor) : { cursor: null, note: null };
  if (strategic && cursor === null) return [...(degraded === undefined ? [] : [degraded]), ...(note === null ? [] : [note])];
  if (!await input.read.exists(entry.path)) return missingRead(input, entry.path);
  const bytes = await input.read.size(entry.path);
  if (group.bytes > 0 && group.bytes + bytes > READ_GROUP_BUDGET_BYTES) { group.id += 1; group.bytes = 0; }
  group.bytes += bytes;
  return [{ type: "read", ...entry, group: group.id, ...(cursor === null ? {} : { cursor }) }];
}

async function missingRead(input: AgendaCompileInput, path: string): Promise<AgendaStep[]> {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.endsWith("/WORKING-MEMORY.md")) return [];
  if (normalized.endsWith("/SESSION-NOTES.md") && compileNotesSync(input).length === 0) {
    const history = await input.read.git(["log", "--oneline", "-10"]);
    return [{ type: "render", surface: "notes-history", text: `No session notes are available. Recent checkout history:\n${history.trim()}` }];
  }
  return [{ type: "note", surface: "missing-file", text: `Expected context file is absent: ${path}` }];
}
