/** Pure spacing validation for ARC task-list root descriptor clusters. */

import {
  scanTaskListStructure,
  type TaskListStructureEvent,
  type TaskStructureItem,
} from "../task-list/scanner.js";

/** One in-memory Markdown document checked by the descriptor rule. */
export interface TaskDescriptorDocument {
  readonly path: string;
  readonly content: string;
}

/** One missing separator inside a wrapped root descriptor cluster. */
export interface TaskDescriptorSpacingDiagnostic {
  readonly path: string;
  readonly line: number;
  readonly parent: { readonly id: string; readonly title: string };
  readonly previous: string;
  readonly next: string;
  readonly message: string;
}

interface DescriptorEntry {
  readonly label: string;
  readonly startLine: number;
  endLine: number;
  wrapped: boolean;
}

const PEER_DESCRIPTOR_RE = /^- _(?<label>Goal|Context|Rationale|Approach|Shape|Note):_(?:\s|$)/u;
const ADDITIONAL_CONTEXT_RE = /^- \*\*Additional Context:\*\*(?:\s|$)/u;
const CONTINUATION_RE = /^(?: {2,}|\t)\S/u;
const LIST_ITEM_RE = /^\s*(?:[-+*]|\d+[.)])\s+/u;

/**
 * Validate root descriptor spacing without reading from or writing to disk.
 *
 * @param document - Repository-relative path and Markdown content
 * @returns Every malformed adjacent descriptor pair
 */
export function validateTaskDescriptorSpacing(
  document: TaskDescriptorDocument,
): readonly TaskDescriptorSpacingDiagnostic[] {
  const scan = scanTaskListStructure(document.content);
  if (scan.status === "malformed") return [];

  const diagnostics: TaskDescriptorSpacingDiagnostic[] = [];
  let parent: TaskStructureItem | null = null;
  let entries: DescriptorEntry[] = [];
  let clusterClosed = true;

  const finishCluster = (): void => {
    if (parent !== null && entries.some(({ wrapped }) => wrapped)) {
      for (let index = 1; index < entries.length; index += 1) {
        const previous = entries[index - 1];
        const next = entries[index];
        if (previous === undefined || next === undefined) continue;
        if (next.startLine > previous.endLine + 1) continue;
        diagnostics.push(createDiagnostic(document.path, parent, previous, next));
      }
    }
    entries = [];
  };

  for (const event of scan.events) {
    if (event.type === "parent") {
      finishCluster();
      parent = event.item;
      clusterClosed = false;
      continue;
    }
    if (event.type === "phase" || event.type === "section") {
      finishCluster();
      parent = null;
      clusterClosed = true;
      continue;
    }
    if (event.type === "subtask" || event.type === "fence") {
      finishCluster();
      clusterClosed = true;
      continue;
    }
    if (parent === null || clusterClosed) continue;
    consumeContentEvent(event, entries, () => {
      finishCluster();
      clusterClosed = true;
    });
  }
  finishCluster();
  return diagnostics;
}

function consumeContentEvent(
  event: Extract<TaskListStructureEvent, { type: "content" }>,
  entries: DescriptorEntry[],
  closeCluster: () => void,
): void {
  if (event.text.trim() === "") return;

  const descriptor = parseDescriptor(event.text, event.line);
  if (descriptor !== null) {
    entries.push(descriptor);
    return;
  }

  if (entries.length > 0 && CONTINUATION_RE.test(event.text) && !LIST_ITEM_RE.test(event.text)) {
    const current = entries.at(-1);
    if (current === undefined) return;
    current.endLine = event.line;
    current.wrapped = true;
    return;
  }

  closeCluster();
}

function parseDescriptor(text: string, line: number): DescriptorEntry | null {
  const peer = PEER_DESCRIPTOR_RE.exec(text);
  const label = peer?.groups?.label
    ?? (ADDITIONAL_CONTEXT_RE.test(text) ? "Additional Context" : undefined);
  return label === undefined
    ? null
    : { label, startLine: line, endLine: line, wrapped: false };
}

function displayLabel(label: string): string {
  return label === "Additional Context" ? "**Additional Context:**" : `_${label}:_`;
}

function createDiagnostic(
  path: string,
  parent: TaskStructureItem,
  previous: DescriptorEntry,
  next: DescriptorEntry,
): TaskDescriptorSpacingDiagnostic {
  return {
    path,
    line: next.startLine,
    parent: { id: parent.id, title: parent.title },
    previous: previous.label,
    next: next.label,
    message: `${path}: Task ${parent.id} "${parent.title}" requires a blank line between ${displayLabel(previous.label)} and ${displayLabel(next.label)} because this root descriptor cluster contains a wrapped entry`,
  };
}
