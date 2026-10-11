/** Changed root descriptor clusters and newly introduced segmentation diagnostics. */
import { scanTaskDescriptorExtents, validateTaskDescriptorSpacing } from "../../../markdown/descriptor-spacing.js";
import { scanTaskListSegmentation, type TaskListSegmentationDiagnostic } from "../../../task-list/segmentation.js";
import { brokenRule } from "../rule-support.js";
import { pairTaskLines } from "./line-pairing.js";
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
/** Check only added or changed root descriptor clusters.
 * @param input - Proposed task-list write.
 * @returns Descriptor spacing violations.
 */
export function checkTaskListDescriptor(input: WriteCheckInput): readonly BrokenRule[] {
  if (input.next === undefined) return [];
  const pairing = pairTaskLines(input.prior?.content, input.next.content);
  const prior = descriptorClusters(input.prior?.content), next = descriptorClusters(input.next.content);
  const changed = new Set(pairing.pairs.filter((pair) => pair.next.type === "parent"
    && (pair.prior === undefined || prior.get(pair.prior.line) !== next.get(pair.next.line))).map((pair) => pair.next.line));
  const extents = scanTaskDescriptorExtents(input.next.content);
  const diagnostics = validateTaskDescriptorSpacing({ path: "task-list", content: input.next.content })
    .filter((item) => {
      const extent = extents.find((candidate) => candidate.startLine === item.line);
      return extent !== undefined && changed.has(extent.parent.lineHint);
    });
  return diagnostics.length === 0 ? [] : [brokenRule("task-list.descriptor",
    diagnostics.map(({ message }) => message).join("\n"),
    "Insert a blank line between every adjacent descriptor when a changed root cluster contains a wrapped value.")];
}
/** Check newly introduced segmentation diagnostics, independent of physical line shifts.
 * @param input - Proposed task-list write.
 * @returns Segmentation violations.
 */
export function checkTaskListSegmentation(input: WriteCheckInput): readonly BrokenRule[] {
  if (input.next === undefined) return [];
  const prior = input.prior === undefined ? [] : scanTaskListSegmentation({ path: "task-list", content: input.prior.content }).diagnostics;
  const known = new Set(prior.map(diagnosticIdentity));
  const added = scanTaskListSegmentation({ path: "task-list", content: input.next.content }).diagnostics
    .filter((item) => !known.has(diagnosticIdentity(item)));
  return added.length === 0 ? [] : [brokenRule("task-list.segmentation", added.map(({ message }) => message).join("\n"),
    "Repair the newly introduced task grammar or segment declarations, then retry.")];
}
function descriptorClusters(content: string | undefined): ReadonlyMap<number, string> {
  const result = new Map<number, string>();
  if (content === undefined) return result;
  const lines = content.split(/\r?\n/u), extents = scanTaskDescriptorExtents(content);
  for (let start = 0; start < extents.length;) {
    const first = extents[start];
    if (first === undefined) break;
    let end = start + 1;
    while (extents[end]?.parent.lineHint === first.parent.lineHint) end += 1;
    const last = extents[end - 1];
    if (last !== undefined) result.set(first.parent.lineHint, lines.slice(first.startLine - 1, last.endLine).join("\n"));
    start = end;
  }
  return result;
}
function diagnosticIdentity(item: TaskListSegmentationDiagnostic): string {
  return item.code === "task-list-malformed" ? item.code
    : `${item.code}:${item.message.slice(`${item.path}:${item.line}: `.length)}`;
}
