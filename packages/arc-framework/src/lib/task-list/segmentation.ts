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
  readonly modeDeclarationLines: number[];
  exitCriterion: { readonly line: number; readonly text: string } | null;
  exitCriterionDeclarationCount: number;
  readonly exitCriterionDeclarationLines: number[];
  firstExitCriterionLine: number | null;
  exitCriterionParagraphOpen: boolean;
  readonly parents: ParentRecord[];
  preambleOpen: boolean;
}

interface ParentRecord {
  readonly id: string;
  readonly line: number;
  readonly segmentVerifier: boolean;
  readonly memberVerifier: boolean;
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
  const outsidePhaseSegmentVerifiers: ParentRecord[] = [];
  let currentPhase: PhaseRecord | null = null;
  let currentParentTaskId: string | null = null;
  let currentSubtask: { readonly id: string; readonly indent: number } | null = null;
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
        modeDeclarationLines: [],
        exitCriterion: null,
        exitCriterionDeclarationCount: 0,
        exitCriterionDeclarationLines: [],
        firstExitCriterionLine: null,
        exitCriterionParagraphOpen: false,
        parents: [],
        preambleOpen: true,
      };
      phases.push(currentPhase);
      currentParentTaskId = null;
      currentSubtask = null;
      continue;
    }
    if (event.type === "parent") {
      const rawLine = lines[event.line - 1] ?? "";
      const segmentVerifier = hasSegmentVerifierSuffix(rawLine);
      if (segmentVerifier) segmentationPresent = true;
      const parent = {
        id: event.item.id,
        line: event.line,
        segmentVerifier,
        memberVerifier: hasMemberVerifierSuffix(rawLine),
      };
      if (currentPhase !== null) {
        currentPhase.preambleOpen = false;
        currentPhase.parents.push(parent);
      } else if (segmentVerifier) {
        outsidePhaseSegmentVerifiers.push(parent);
      }
      currentParentTaskId = event.item.id;
      currentSubtask = null;
      continue;
    }
    if (event.type === "subtask") {
      currentSubtask = {
        id: event.item.id,
        indent: leadingWhitespaceLength(lines[event.line - 1] ?? ""),
      };
      continue;
    }
    if (event.type === "section") {
      currentPhase = null;
      currentParentTaskId = null;
      currentSubtask = null;
      continue;
    }
    if (event.type !== "content") continue;
    if (currentParentTaskId !== null) {
      const phaseId = RETIRING_PHASE_RE.exec(event.text)?.groups?.phaseId;
      if (phaseId !== undefined) {
        const taskId = currentSubtask !== null
          && leadingWhitespaceLength(event.text) > currentSubtask.indent
          ? currentSubtask.id
          : currentParentTaskId;
        retiringPhaseReferences.push({ taskId, line: event.line, phaseId });
      }
    }
    if (currentPhase?.preambleOpen === true) {
      const text = event.text.trim();
      if (currentPhase.exitCriterionParagraphOpen) {
        if (text === "") {
          currentPhase.exitCriterionParagraphOpen = false;
        } else if (text.startsWith("_Mode:_") || text.startsWith("_Exit criterion:_")) {
          currentPhase.exitCriterionParagraphOpen = false;
        } else if (currentPhase.exitCriterion !== null) {
          currentPhase.exitCriterion = {
            ...currentPhase.exitCriterion,
            text: `${currentPhase.exitCriterion.text} ${text}`,
          };
          continue;
        }
      }
      consumePreambleLine(document.path, event, currentPhase, diagnostics, () => {
        segmentationPresent = true;
      });
    }
  }

  const terminalPhase = phases.at(-1);
  if (terminalPhase !== undefined) {
    for (const line of [
      ...terminalPhase.modeDeclarationLines,
      ...terminalPhase.exitCriterionDeclarationLines,
    ]) {
      diagnostics.push(diagnostic(
        document.path,
        line,
        "terminal-phase-segmented",
        "Terminal Verification phase must not carry _Mode:_ or _Exit criterion:_",
      ));
    }
  }
  if (!segmentationPresent) {
    diagnostics.sort((left, right) => left.line - right.line);
    return { segments: [], retiringPhaseReferences: [], diagnostics };
  }

  const segments: TaskListSegment[] = [];
  const coveredPhaseLines = new Set<number>();
  const closingPhaseLines = new Set<number>();
  const coveringOpeningPhaseByIndex: Array<PhaseRecord | undefined> = [];
  for (const [openingIndex, phase] of phases.entries()) {
    if (openingIndex === phases.length - 1) continue;
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
  const declaredSegmentCount = phases.slice(0, -1).filter((phase) => phase.mode !== null).length;
  const allowedSegmentVerifierLines = new Set<number>();
  for (const segment of segments) {
    const closingPhase = phases.find((phase) => phase.reference.line === segment.closingPhase.line);
    const verifierCandidate = closingPhase?.parents.filter((parent) => !parent.memberVerifier).at(-1);
    if (verifierCandidate?.segmentVerifier === true) {
      allowedSegmentVerifierLines.add(verifierCandidate.line);
      continue;
    }
    if (segment.mode !== "layer" && declaredSegmentCount !== 1) {
      diagnostics.push(diagnostic(
        document.path,
        segment.closingPhase.line,
        "segment-verifier-missing",
        `Segment closing at Phase ${segment.closingPhase.id} requires a final non-member task with the segment-verifier suffix`,
      ));
    }
  }
  const orphanCandidates = [
    ...phases.slice(0, -1).flatMap((phase) => phase.parents),
    ...outsidePhaseSegmentVerifiers.filter((parent) => (
      terminalPhase === undefined || parent.line < terminalPhase.reference.line
    )),
  ];
  for (const parent of orphanCandidates) {
    if (!parent.segmentVerifier || allowedSegmentVerifierLines.has(parent.line)) continue;
    diagnostics.push(diagnostic(
      document.path,
      parent.line,
      "segment-verifier-orphan",
      `Task ${parent.id} carries the segment-verifier suffix outside a segment-closing position`,
    ));
  }
  if (terminalPhase !== undefined) {
    for (const parent of [
      ...terminalPhase.parents,
      ...outsidePhaseSegmentVerifiers.filter((candidate) => (
        candidate.line > terminalPhase.reference.line
      )),
    ]) {
      if (!parent.segmentVerifier) continue;
      diagnostics.push(diagnostic(
        document.path,
        parent.line,
        "segment-verifier-terminal",
        `Task ${parent.id} places a segment verifier in the terminal Verification phase`,
      ));
    }
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
    phase.modeDeclarationLines.push(event.line);
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
    phase.exitCriterionDeclarationLines.push(event.line);
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
      phase.exitCriterionParagraphOpen = true;
    }
  }
}

function isTaskListSegmentMode(value: string): value is TaskListSegmentMode {
  return value === "slice" || value === "layer" || value === "replication";
}

function leadingWhitespaceLength(line: string): number {
  return /^\s*/u.exec(line)?.[0].length ?? 0;
}

function diagnostic(
  path: string,
  line: number,
  code: TaskListSegmentationDiagnosticCode,
  body: string,
): TaskListSegmentationDiagnostic {
  return { code, path, line, message: `${path}:${line}: ${body}` };
}
