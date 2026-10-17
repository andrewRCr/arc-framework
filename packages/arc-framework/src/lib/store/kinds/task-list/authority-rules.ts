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
  const completed = closed.filter(({ next }) => next.marker === "x").map(({ next }) => next.item.id);
  const deferred = closed.filter(({ prior, next }) => next.marker === "~" && (prior === undefined || prior.marker === " ")).map(({ next }) => next.item.id);
  const reopened = closed.filter(({ prior, next }) => prior !== undefined && prior.marker !== " " && next.marker !== "x").map(({ next }) => next.item.id);
  const repairs = [
    ...(completed.length === 0 ? [] : [`Commit with arc release commit --close=${completed.join(",")}, or make the commit first, then arc task close ${completed.join(" ")}.`]),
    ...deferred.map((id) => `Defer with arc task defer ${id}.`),
    ...(reopened.length === 0 ? [] : [`A closed task stays closed (${reopened.join(", ")}); add a new task for corrective work.`]),
  ];
  return closed.length === 0 ? [] : [brokenRule("task-list.close",
    `A hand edit changes closed task markers: ${closed.map(({ next }) => `${next.item.id} (line ${next.line})`).join(", ")}.`,
    repairs.join(" "))];
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
