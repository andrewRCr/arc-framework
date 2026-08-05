/** Structured parser for task references admitted by Context-footer policy. */

/** One single task id or inclusive range in a task-reference expression. */
export type ParsedTaskReferenceItem =
  | { readonly kind: "single"; readonly taskId: string }
  | { readonly kind: "range"; readonly startTaskId: string; readonly endTaskId: string };

/** One accepted task-reference expression, before inventory resolution. */
export interface ParsedTaskReference {
  readonly cardinality: "single" | "multiple";
  readonly items: readonly ParsedTaskReferenceItem[];
  readonly qualifier: "planning" | "maintenance" | null;
}

const TASK_ID_SOURCE = "[0-9]+(?:\\.[0-9A-Za-z]+)+";
const TASK_RANGE_SOURCE = `${TASK_ID_SOURCE}-[0-9A-Za-z]+(?:\\.[0-9A-Za-z]+)*`;
const TASK_ITEM_SOURCE = `(?:${TASK_ID_SOURCE}|${TASK_RANGE_SOURCE})`;
const TASK_LIST_SOURCE = `(?:${TASK_RANGE_SOURCE}|${TASK_ITEM_SOURCE}(?:, ${TASK_ITEM_SOURCE})+)`;
const SINGLE_PATTERN = new RegExp(
  `^Task (?<item>${TASK_ID_SOURCE})(?:; (?<qualifier>planning|maintenance))?$`,
  "u",
);
const MULTIPLE_PATTERN = new RegExp(
  `^Tasks (?<items>${TASK_LIST_SOURCE})(?:; (?<qualifier>planning|maintenance))?$`,
  "u",
);
const RANGE_PATTERN = new RegExp(
  `^(?<start>${TASK_ID_SOURCE})-(?<end>[0-9A-Za-z]+(?:\\.[0-9A-Za-z]+)*)$`,
  "u",
);
const NON_REFERENCE_PATTERN = /^(?:incidental during \S(?:.*\S)?|planning|maintenance|code review)$/u;

/**
 * Whether a task-list Context value is valid metadata without a task attribution.
 *
 * @param value - Parenthetical content from a task-list Context footer
 * @returns True when policy admits the value without a task reference
 */
export function isTaskNonReferenceContext(value: string): boolean {
  return NON_REFERENCE_PATTERN.test(value);
}

/** Parse one task-reference expression without applying repository semantics. */
export function parseTaskReference(value: string): ParsedTaskReference | null {
  const single = SINGLE_PATTERN.exec(value);
  if (single?.groups !== undefined) {
    const taskId = single.groups.item;
    if (taskId === undefined) return null;
    return {
      cardinality: "single",
      items: [{ kind: "single", taskId }],
      qualifier: qualifier(single.groups.qualifier),
    };
  }

  const multiple = MULTIPLE_PATTERN.exec(value);
  const source = multiple?.groups?.items;
  if (source === undefined) return null;
  const items = source.split(", ").map(parseItem);
  if (items.some((item) => item === null)) return null;
  return {
    cardinality: "multiple",
    items: items.filter((item): item is ParsedTaskReferenceItem => item !== null),
    qualifier: qualifier(multiple?.groups?.qualifier),
  };
}

function parseItem(value: string): ParsedTaskReferenceItem | null {
  const range = RANGE_PATTERN.exec(value);
  if (range?.groups !== undefined) {
    const startTaskId = range.groups.start;
    const end = range.groups.end;
    if (startTaskId === undefined || end === undefined) return null;
    const endTaskId = end.includes(".")
      ? end
      : [...startTaskId.split(".").slice(0, -1), end].join(".");
    return { kind: "range", startTaskId, endTaskId };
  }
  return new RegExp(`^${TASK_ID_SOURCE}$`, "u").test(value)
    ? { kind: "single", taskId: value }
    : null;
}

function qualifier(value: string | undefined): ParsedTaskReference["qualifier"] {
  return value === "planning" || value === "maintenance" ? value : null;
}
