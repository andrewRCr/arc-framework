/** Pure segmentation extraction from structurally scanned ARC task lists. */

import {
  scanTaskListStructure,
  type TaskListStructureEvent,
} from "./scanner.js";

/** Closed set of authored task-list segment modes. */
export type TaskListSegmentMode = "slice" | "layer" | "replication";

/** One phase named by a resolved task-list segment. */
export interface TaskListPhaseReference {
  readonly id: string;
  readonly line: number;
}

/** One resolved segment and its closing criterion. */
export interface TaskListSegment {
  readonly mode: TaskListSegmentMode;
  readonly openingPhase: TaskListPhaseReference;
  readonly closingPhase: TaskListPhaseReference;
  readonly phaseIds: readonly string[];
  readonly exitCriterion: { readonly line: number; readonly text: string };
}

/** One task-body reference to the phase that retires temporary scaffolding. */
export interface TaskListRetiringPhaseReference {
  readonly taskId: string;
  readonly line: number;
  readonly phaseId: string;
}

/** Closed diagnostic family emitted by the segmentation scan. */
export type TaskListSegmentationDiagnosticCode =
  | "task-list-malformed"
  | "phase-outside-segment"
  | "phase-id-duplicate"
  | "mode-malformed"
  | "mode-unknown"
  | "span-invalid"
  | "segment-missing-exit-criterion"
  | "segment-verifier-missing"
  | "segment-verifier-orphan"
  | "segment-overlap"
  | "mode-duplicate"
  | "exit-criterion-empty"
  | "exit-criterion-duplicate"
  | "exit-criterion-orphan"
  | "terminal-phase-segmented"
  | "segment-verifier-terminal"
  | "retiring-phase-missing";

/** One source-located segmentation failure. */
export interface TaskListSegmentationDiagnostic {
  readonly code: TaskListSegmentationDiagnosticCode;
  readonly path: string;
  readonly line: number;
  readonly message: string;
}

/** Complete segmentation result in document order. */
export interface TaskListSegmentationResult {
  readonly segments: readonly TaskListSegment[];
  readonly retiringPhaseReferences: readonly TaskListRetiringPhaseReference[];
  readonly diagnostics: readonly TaskListSegmentationDiagnostic[];
}

/** One in-memory task-list document selected for segmentation validation. */
export interface TaskListSegmentationDocument {
  readonly path: string;
  readonly content: string;
}

interface PhaseRecord {
  readonly reference: TaskListPhaseReference;
  mode: {
    readonly mode: TaskListSegmentMode;
    readonly line: number;
    readonly throughPhaseId: string | null;
  } | null;
  exitCriterion: { readonly line: number; readonly text: string } | null;
  preambleOpen: boolean;
}

const MODE_RE = /^_Mode:_\s+`(?<mode>slice|layer|replication)`(?:\s+through Phase\s+(?<through>.+?))?\s+—\s+(?<gloss>\S.*)$/u;
const EXIT_CRITERION_RE = /^_Exit criterion:_\s+(?<text>\S.*)$/u;
const RETIRING_PHASE_RE = /^\s*-\s+_Retired in:_\s+Phase\s+(?<phaseId>\S(?:.*\S)?)\s*$/u;
const SEGMENT_VERIFIER_SUFFIX = "— validate exit criterion at segment scope";
const MEMBER_VERIFIER_SUFFIX = "— validate criteria at member scope";

/** Return whether a raw parent heading carries the exact segment-verifier suffix. */
export function hasSegmentVerifierSuffix(line: string): boolean {
  return line.trimEnd().endsWith(SEGMENT_VERIFIER_SUFFIX);
}

/** Return whether a raw parent heading carries the exact member-verifier suffix. */
export function hasMemberVerifierSuffix(line: string): boolean {
  return line.trimEnd().endsWith(MEMBER_VERIFIER_SUFFIX);
}

/**
 * Resolve authored segmentation from one task-list document.
 *
 * @param document - Repository-relative path and task-list content
 * @returns Ordered segments, retiring references, and source diagnostics
 */
export function scanTaskListSegmentation(
  document: TaskListSegmentationDocument,
): TaskListSegmentationResult {
  const scan = scanTaskListStructure(document.content);
  if (scan.status === "malformed") {
    return {
      segments: [],
      retiringPhaseReferences: [],
      diagnostics: [diagnostic(
        document.path,
        scan.error.line,
        "task-list-malformed",
        `Task-list structure is malformed: ${scan.error.message}`,
      )],
    };
  }

  const lines = document.content.split(/\r?\n/u);
  const phases: PhaseRecord[] = [];
  const retiringPhaseReferences: TaskListRetiringPhaseReference[] = [];
  let currentPhase: PhaseRecord | null = null;
  let currentTaskId: string | null = null;
  let segmentationPresent = false;

  for (const event of scan.events) {
    if (event.type === "phase") {
      currentPhase = {
        reference: { id: event.id, line: event.line },
        mode: null,
        exitCriterion: null,
        preambleOpen: true,
      };
      phases.push(currentPhase);
      currentTaskId = null;
      continue;
    }
    if (event.type === "parent") {
      if (hasSegmentVerifierSuffix(lines[event.line - 1] ?? "")) segmentationPresent = true;
      if (currentPhase !== null) currentPhase.preambleOpen = false;
      currentTaskId = event.item.id;
      continue;
    }
    if (event.type === "section") {
      currentPhase = null;
      currentTaskId = null;
      continue;
    }
    if (event.type !== "content") continue;
    if (currentTaskId !== null) {
      const phaseId = RETIRING_PHASE_RE.exec(event.text)?.groups?.phaseId;
      if (phaseId !== undefined) {
        retiringPhaseReferences.push({ taskId: currentTaskId, line: event.line, phaseId });
      }
    }
    if (currentPhase?.preambleOpen === true) {
      consumePreambleLine(event, currentPhase, () => {
        segmentationPresent = true;
      });
    }
  }

  if (!segmentationPresent) {
    return { segments: [], retiringPhaseReferences: [], diagnostics: [] };
  }

  const segments: TaskListSegment[] = [];
  for (const [openingIndex, phase] of phases.entries()) {
    if (phase.mode === null) continue;
    const closingIndex = phase.mode.throughPhaseId === null
      ? openingIndex
      : phases.findIndex((candidate, index) => (
        index > openingIndex && candidate.reference.id === phase.mode?.throughPhaseId
      ));
    const closingPhase = phases[closingIndex];
    if (closingPhase === undefined || closingPhase.exitCriterion === null) continue;
    segments.push({
      mode: phase.mode.mode,
      openingPhase: phase.reference,
      closingPhase: closingPhase.reference,
      phaseIds: phases.slice(openingIndex, closingIndex + 1).map((candidate) => candidate.reference.id),
      exitCriterion: closingPhase.exitCriterion,
    });
  }
  return { segments, retiringPhaseReferences, diagnostics: [] };
}

function consumePreambleLine(
  event: Extract<TaskListStructureEvent, { type: "content" }>,
  phase: PhaseRecord,
  notePresence: () => void,
): void {
  const text = event.text.trim();
  if (text.startsWith("_Mode:_")) {
    notePresence();
    const match = MODE_RE.exec(text);
    const mode = match?.groups?.mode as TaskListSegmentMode | undefined;
    if (mode !== undefined) {
      phase.mode = {
        mode,
        line: event.line,
        throughPhaseId: match?.groups?.through?.trim() ?? null,
      };
    }
    return;
  }
  const exitCriterion = EXIT_CRITERION_RE.exec(text)?.groups?.text;
  if (exitCriterion !== undefined) {
    phase.exitCriterion = { line: event.line, text: exitCriterion };
  }
}

function diagnostic(
  path: string,
  line: number,
  code: TaskListSegmentationDiagnosticCode,
  body: string,
): TaskListSegmentationDiagnostic {
  return { code, path, line, message: `${path}:${line}: ${body}` };
}
