/** Task-list check inputs with real header fields and complete memory views. */
import { parseTaskListRecord } from "../../../src/lib/store/kinds/task-list/parser.js";
import type { WriteCheckInput } from "../../../src/lib/store/write-check.js";
import { META_RULE_UID, metaRuleInput } from "./meta-rule-input.js";
import { ruleRecord, ruleView } from "./rule-view.js";
/** Canonical open task list used by pure rule cases. */
export const TASK_RULE_CONTENT = "# Task List: Example\n\n- **Design:** `spec-example.md`\n\n---\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Build**\n\n- _Goal:_ Build behavior.\n";
/** Produce both task-list versions alongside their owning primary record.
 * @param nextContent - Proposed bytes, or null for removal.
 * @param priorContent - Stored bytes, or null for creation.
 * @param writer - Derived writer, hand edit by default.
 * @returns A complete pure check input.
 */
export function taskRuleInput(nextContent: string | null = TASK_RULE_CONTENT, priorContent: string | null = TASK_RULE_CONTENT,
  writer: WriteCheckInput["writer"] = { kind: "hand-edit" }): WriteCheckInput {
  const meta = metaRuleInput().next;
  if (meta === undefined) throw new Error("This fixture needs a primary record.");
  const primary = ruleRecord("work-item/meta", "example", META_RULE_UID, meta.content, meta.fields);
  const prior = priorContent === null ? undefined : ruleRecord("work-item/task-list", "example", META_RULE_UID,
    priorContent, parseTaskListRecord(priorContent));
  const next = nextContent === null ? undefined : ruleRecord("work-item/task-list", "example", META_RULE_UID,
    nextContent, parseTaskListRecord(nextContent));
  const reference = next?.reference ?? prior?.reference;
  if (reference === undefined) throw new Error("A task-list input needs a prior or next version.");
  return { reference, writer, before: ruleView([primary, ...(prior === undefined ? [] : [prior])]),
    after: ruleView([primary, ...(next === undefined ? [] : [next])]),
    ...(prior === undefined ? {} : { prior: { content: prior.content, fields: prior.fields } }),
    ...(next === undefined ? {} : { next: { content: next.content, fields: next.fields } }) };
}
