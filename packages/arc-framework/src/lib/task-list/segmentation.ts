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
  modeDeclarationCount: number;
  exitCriterion: { readonly line: number; readonly text: string } | null;
  exitCriterionDeclarationCount: number;
  firstExitCriterionLine: number | null;
  preambleOpen: boolean;
}

const MODE_RE = /^_Mode:_\s+`(?<mode>[^`\s]+)`(?:\s+through Phase\s+(?<through>.+?))?\s+—\s+(?<gloss>\S.*)$/u;
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
  const diagnostics: TaskListSegmentationDiagnostic[] = [];
  const phaseIds = new Set<string>();
  let currentPhase: PhaseRecord | null = null;
  let currentTaskId: string | null = null;
  let segmentationPresent = false;

  for (const event of scan.events) {
    if (event.type === "phase") {
      if (phaseIds.has(event.id)) {
        diagnostics.push(diagnostic(
          document.path,
          event.line,
          "phase-id-duplicate",
          `Phase ${event.id} is declared more than once`,
        ));
      }
      phaseIds.add(event.id);
      currentPhase = {
        reference: { id: event.id, line: event.line },
        mode: null,
        modeDeclarationCount: 0,
        exitCriterion: null,
        exitCriterionDeclarationCount: 0,
        firstExitCriterionLine: null,
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
      consumePreambleLine(document.path, event, currentPhase, diagnostics, () => {
        segmentationPresent = true;
      });
    }
  }

  if (!segmentationPresent) {
    return { segments: [], retiringPhaseReferences: [], diagnostics: [] };
  }

  const segments: TaskListSegment[] = [];
  const coveredPhaseLines = new Set<number>();
  const closingPhaseLines = new Set<number>();
  const coveringOpeningPhaseByIndex: Array<PhaseRecord | undefined> = [];
  for (const [openingIndex, phase] of phases.entries()) {
    if (phase.mode === null) continue;
    const closingIndex = phase.mode.throughPhaseId === null
      ? openingIndex
      : phases.findIndex((candidate, index) => (
        index > openingIndex && candidate.reference.id === phase.mode?.throughPhaseId
      ));
    if (closingIndex < 0 && phase.mode.throughPhaseId !== null) {
      diagnostics.push(diagnostic(
        document.path,
        phase.mode.line,
        "span-invalid",
        `Phase ${phase.reference.id} declares an invalid segment span through Phase ${phase.mode.throughPhaseId}`,
      ));
      continue;
    }
    const closingPhase = phases[closingIndex];
    if (closingPhase === undefined) continue;
    closingPhaseLines.add(closingPhase.reference.line);
    const containingPhase = coveringOpeningPhaseByIndex[openingIndex];
    if (containingPhase !== undefined) {
      diagnostics.push(diagnostic(
        document.path,
        phase.mode.line,
        "segment-overlap",
        `Phase ${phase.reference.id} opens a segment inside the span opened at Phase ${containingPhase.reference.id}`,
      ));
    }
    for (let index = openingIndex + 1; index <= closingIndex; index += 1) {
      coveringOpeningPhaseByIndex[index] ??= phase;
    }
    for (const coveredPhase of phases.slice(openingIndex, closingIndex + 1)) {
      coveredPhaseLines.add(coveredPhase.reference.line);
    }
    if (closingPhase.exitCriterion === null) {
      diagnostics.push(diagnostic(
        document.path,
        closingPhase.reference.line,
        "segment-missing-exit-criterion",
        `Segment closing at Phase ${closingPhase.reference.id} has no _Exit criterion:_`,
      ));
      continue;
    }
    segments.push({
      mode: phase.mode.mode,
      openingPhase: phase.reference,
      closingPhase: closingPhase.reference,
      phaseIds: phases.slice(openingIndex, closingIndex + 1).map((candidate) => candidate.reference.id),
      exitCriterion: closingPhase.exitCriterion,
    });
  }
  for (const phase of phases.slice(0, -1)) {
    if (coveredPhaseLines.has(phase.reference.line)) continue;
    diagnostics.push(diagnostic(
      document.path,
      phase.reference.line,
      "phase-outside-segment",
      `Phase ${phase.reference.id} belongs to no declared segment`,
    ));
  }
  for (const phase of phases.slice(0, -1)) {
    if (phase.firstExitCriterionLine === null || closingPhaseLines.has(phase.reference.line)) continue;
    diagnostics.push(diagnostic(
      document.path,
      phase.firstExitCriterionLine,
      "exit-criterion-orphan",
      `Phase ${phase.reference.id} carries _Exit criterion:_ but closes no segment`,
    ));
  }
  for (const reference of retiringPhaseReferences) {
    if (phaseIds.has(reference.phaseId)) continue;
    diagnostics.push(diagnostic(
      document.path,
      reference.line,
      "retiring-phase-missing",
      `Task ${reference.taskId} names missing retiring Phase ${reference.phaseId}`,
    ));
  }
  diagnostics.sort((left, right) => left.line - right.line);
  return { segments, retiringPhaseReferences, diagnostics };
}

function consumePreambleLine(
  path: string,
  event: Extract<TaskListStructureEvent, { type: "content" }>,
  phase: PhaseRecord,
  diagnostics: TaskListSegmentationDiagnostic[],
  notePresence: () => void,
): void {
  const text = event.text.trim();
  if (text.startsWith("_Mode:_")) {
    notePresence();
    phase.modeDeclarationCount += 1;
    if (phase.modeDeclarationCount > 1) {
      diagnostics.push(diagnostic(
        path,
        event.line,
        "mode-duplicate",
        `Phase ${phase.reference.id} carries more than one _Mode:_ declaration`,
      ));
    }
    const match = MODE_RE.exec(text);
    const mode = match?.groups?.mode;
    if (mode === undefined) {
      diagnostics.push(diagnostic(
        path,
        event.line,
        "mode-malformed",
        `Phase ${phase.reference.id} has malformed _Mode:_ syntax`,
      ));
      return;
    }
    if (!isTaskListSegmentMode(mode)) {
      diagnostics.push(diagnostic(
        path,
        event.line,
        "mode-unknown",
        `Phase ${phase.reference.id} declares unknown segment mode ${mode}`,
      ));
      return;
    }
    if (phase.mode === null) {
      phase.mode = {
        mode,
        line: event.line,
        throughPhaseId: match?.groups?.through?.trim() ?? null,
      };
    }
    return;
  }
  if (text.startsWith("_Exit criterion:_")) {
    phase.exitCriterionDeclarationCount += 1;
    phase.firstExitCriterionLine ??= event.line;
    if (phase.exitCriterionDeclarationCount > 1) {
      diagnostics.push(diagnostic(
        path,
        event.line,
        "exit-criterion-duplicate",
        `Phase ${phase.reference.id} carries more than one _Exit criterion:_ declaration`,
      ));
    }
    const exitCriterion = EXIT_CRITERION_RE.exec(text)?.groups?.text;
    if (exitCriterion === undefined) {
      diagnostics.push(diagnostic(
        path,
        event.line,
        "exit-criterion-empty",
        `Phase ${phase.reference.id} has an empty _Exit criterion:_ declaration`,
      ));
      return;
    }
    if (phase.exitCriterion === null) {
      phase.exitCriterion = { line: event.line, text: exitCriterion };
    }
  }
}

function isTaskListSegmentMode(value: string): value is TaskListSegmentMode {
  return value === "slice" || value === "layer" || value === "replication";
}

function diagnostic(
  path: string,
  line: number,
  code: TaskListSegmentationDiagnosticCode,
  body: string,
): TaskListSegmentationDiagnostic {
  return { code, path, line, message: `${path}:${line}: ${body}` };
}
