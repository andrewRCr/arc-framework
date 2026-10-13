/** Hand edits preserve task closure and the machine-owned delivery-plan region. */
import { brokenRule } from "../rule-support.js";
import { DELIVERY_PLAN_START_SENTINEL, DELIVERY_PLAN_END_SENTINEL } from "./delivery-plan-splice.js";
import { pairTaskLines } from "./line-pairing.js";
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
/** Guard new closure and changes to already closed task markers.
 * @param input - Proposed task-list write.
 * @returns Task-marker authority violations.
 */
export function checkTaskListClose(input: WriteCheckInput): readonly BrokenRule[] {
  if (input.writer.kind === "verb") return [];
  const pairing = pairTaskLines(input.prior?.content, input.next?.content);
  if (!pairing.priorReadable) return [];
  const closed = pairing.pairs.filter(({ prior, next }) =>
    (next.marker !== " " && next.marker !== prior?.marker)
    || (prior !== undefined && prior.marker !== " " && prior.marker !== next.marker));
  return closed.length === 0 ? [] : [brokenRule("task-list.close",
    `A hand edit changes closed task markers: ${closed.map(({ next }) => `${next.item.id} (line ${next.line})`).join(", ")}.`,
    "Use the verb that owns task closure or reopening, then retry the remaining hand edit.")];
}
/** Guard the exact marked delivery-plan region.
 * @param input - Proposed task-list write.
 * @returns Delivery-region authority violations.
 */
export function checkTaskListDeliveryPlan(input: WriteCheckInput): readonly BrokenRule[] {
  if (input.writer.kind === "verb") return [];
  const prior = markedRegions(input.prior?.content), next = markedRegions(input.next?.content);
  return JSON.stringify(prior) === JSON.stringify(next) ? [] : [brokenRule("task-list.delivery-plan",
    "A hand edit changes the machine-owned delivery-plan region or its markers.",
    "Use delivery composition to change the marked region; edit only the unmarked provisional section by hand.")];
}

function markedRegions(content: string | undefined): readonly string[] {
  if (content === undefined) return [];
  const regions: string[] = [];
  let start: number | undefined;
  for (const match of content.matchAll(/[^\n]*(?:\n|$)/gu)) {
    const line = match[0].replace(/\r?\n$/u, "");
    if (line === DELIVERY_PLAN_START_SENTINEL && start === undefined) start = match.index;
    else if (line === DELIVERY_PLAN_END_SENTINEL && start !== undefined) {
      regions.push(content.slice(start, match.index + line.length));
      start = undefined;
    }
  }
  return regions;
}
