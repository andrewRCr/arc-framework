/** Exact delivery-plan region replacement over task-list content. */

import { scanTaskListStructure } from "../../../task-list/scanner.js";

/** Exact sentinels bounding the machine-rendered delivery-plan region. */
export const DELIVERY_PLAN_START_SENTINEL = "<!-- arc:delivery-plan:start -->";
export const DELIVERY_PLAN_END_SENTINEL = "<!-- arc:delivery-plan:end -->";

/** Replacement content or an unavailable, ambiguous, or malformed region. */
export type SpliceDeliveryPlanSectionResult =
  | { readonly status: "rendered"; readonly content: string }
  | { readonly status: "refused"; readonly reason:
    "replacement-locus-missing" | "replacement-locus-duplicate" | "replacement-locus-malformed" };

interface TextLines {
  readonly values: readonly string[];
  readonly starts: readonly number[];
}

function textLines(content: string): TextLines {
  const values = content.split("\n").map((line) => line.endsWith("\r") ? line.slice(0, -1) : line);
  const starts: number[] = [];
  let offset = 0;
  for (const line of content.split("\n")) {
    starts.push(offset);
    offset += line.length + 1;
  }
  return { values, starts };
}

function replaceMarkedRange(content: string, section: string, lines: TextLines) {
  const starts = lines.values.flatMap((line, index) => (
    line === DELIVERY_PLAN_START_SENTINEL ? [index] : []
  ));
  const ends = lines.values.flatMap((line, index) => (
    line === DELIVERY_PLAN_END_SENTINEL ? [index] : []
  ));
  if (starts.length !== 1 || ends.length !== 1) {
    return { status: "refused", reason: "replacement-locus-malformed" } as const;
  }
  const startLine = starts[0];
  const endLine = ends[0];
  if (startLine === undefined || endLine === undefined || startLine >= endLine
    || lines.values[startLine + 1] !== "## Delivery Plan"
    || lines.values.slice(startLine + 1, endLine).filter((line) => line === "## Delivery Plan").length !== 1) {
    return { status: "refused", reason: "replacement-locus-malformed" } as const;
  }
  const startOffset = lines.starts[startLine];
  let suffixLine = endLine + 1;
  while (lines.values[suffixLine]?.trim() === "") suffixLine += 1;
  const endOffset = lines.starts[suffixLine] ?? content.length;
  if (startOffset === undefined) {
    return { status: "refused", reason: "replacement-locus-malformed" } as const;
  }
  return {
    status: "rendered",
    content: `${content.slice(0, startOffset)}${section}${content.slice(endOffset)}`,
  } as const;
}

/** Replace a marked region or one unmarked top-level delivery-plan section.
 * @param content - Whole task-list Markdown.
 * @param section - Already-rendered replacement section, including its sentinels and trailing spacing.
 * @returns Exact replacement bytes or the region's refusal.
 */
export function spliceDeliveryPlanSection(content: string, section: string): SpliceDeliveryPlanSectionResult {
  const lines = textLines(content);
  const markerCount = lines.values.filter((line) => (
    line === DELIVERY_PLAN_START_SENTINEL || line === DELIVERY_PLAN_END_SENTINEL
  )).length;
  if (markerCount > 0) return replaceMarkedRange(content, section, lines);

  const scan = scanTaskListStructure(content);
  if (scan.status === "malformed") {
    return { status: "refused", reason: "replacement-locus-malformed" };
  }
  const deliveryLines = scan.events.flatMap((event) => (
    event.type === "section" && lines.values[event.line - 1] === "## Delivery Plan"
      ? [event.line]
      : []
  ));
  if (deliveryLines.length === 0) return { status: "refused", reason: "replacement-locus-missing" };
  if (deliveryLines.length > 1) return { status: "refused", reason: "replacement-locus-duplicate" };
  const targetLine = deliveryLines[0];
  if (targetLine === undefined) return { status: "refused", reason: "replacement-locus-missing" };
  const nextSection = scan.events.find((event) => (
    (event.type === "section" || event.type === "phase") && event.line > targetLine
  ));
  const startOffset = lines.starts[targetLine - 1];
  const endOffset = nextSection === undefined ? content.length : lines.starts[nextSection.line - 1];
  if (startOffset === undefined || endOffset === undefined) {
    return { status: "refused", reason: "replacement-locus-malformed" };
  }
  return {
    status: "rendered",
    content: `${content.slice(0, startOffset)}${section}${content.slice(endOffset)}`,
  };
}

