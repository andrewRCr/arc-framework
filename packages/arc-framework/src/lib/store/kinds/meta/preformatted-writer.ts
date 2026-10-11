/** Internal adapter from legacy preformatted bullets to semantic field writers. */

import { MetaRecordSchema } from "../../../active/meta-schema.js";
import { stripInlineCode } from "./line-reading.js";
import { parseIdentifierList, type MetaFieldName } from "./projection.js";
import {
  writeMetaCohort, writeMetaDependsOn, writeMetaOrigin, writeMetaDesign, writeMetaTaskList,
  writeMetaReviewRubric, writeMetaPromotionReceipt, writeMetaCandidate, writeMetaCurrentWorkflow,
  writeMetaLastCompleted, writeMetaNextTask, writeMetaBlockers, writeMetaNextAction,
  writeMetaStateAtHandoff, writeMetaCommitAtHandoff, writeMetaSessionType, writeMetaPrUrl, writeMetaCompleted,
} from "./bullet-writers.js";

function nullableValue(value: string): string | null {
  return value === "[none]" || value === "—" ? null : value;
}

function identifier(value: string): string | null {
  return nullableValue(stripInlineCode(value));
}

function url(value: string): string | null {
  return identifier(/^<(.+)>$/u.exec(value.trim())?.[1] ?? value);
}

type PreformattedWriter = (content: string, value: string) => string;
const writers: Partial<Record<MetaFieldName, PreformattedWriter>> = {
  Cohort: (content, value) => writeMetaCohort(content, identifier(value)),
  "Depends On": (content, value) => writeMetaDependsOn(content, parseIdentifierList(stripInlineCode(value))),
  Origin: (content, value) => writeMetaOrigin(content, value === "[internal]" ? "internal" : url(value) ?? "—"),
  Design: (content, value) => writeMetaDesign(content, parseIdentifierList(stripInlineCode(value))),
  "Task List": (content, value) => writeMetaTaskList(content, identifier(value)),
  "Review Rubric": (content, value) => writeMetaReviewRubric(content, identifier(value)),
  "Promotion Receipt": (content, value) => writeMetaPromotionReceipt(content, identifier(value)),
  Candidate: (content, value) => writeMetaCandidate(content, MetaRecordSchema.shape.candidateId.parse(identifier(value))),
  "Current Workflow": (content, value) => writeMetaCurrentWorkflow(content, identifier(value)),
  "Last Completed": (content, value) => writeMetaLastCompleted(content, nullableValue(value)),
  "Next Task": (content, value) => writeMetaNextTask(content, nullableValue(value)),
  Blockers: (content, value) => writeMetaBlockers(content, nullableValue(value)),
  "Next Action": (content, value) => writeMetaNextAction(content, nullableValue(value)),
  "State at Handoff": (content, value) => writeMetaStateAtHandoff(content,
    MetaRecordSchema.shape.stateAtHandoff.parse(identifier(value))),
  "Commit at Handoff": (content, value) => writeMetaCommitAtHandoff(content, identifier(value)),
  "Session Type": (content, value) => writeMetaSessionType(content,
    MetaRecordSchema.shape.sessionType.parse(identifier(value))),
  "PR URL": (content, value) => writeMetaPrUrl(content, url(value)),
  Completed: (content, value) => writeMetaCompleted(content, nullableValue(value)),
};

/** Apply a legacy bullet value through its field's semantic writer.
 * @param content - Anchored metadata Markdown.
 * @param name - Managed bullet label; core-table labels are refused.
 * @param value - Canonical preformatted value supplied by an existing caller.
 * @returns Markdown with only the selected bullet's lines edited.
 * @throws When the field has no bullet writer or its writer refuses the edit.
 */
export function writePreformattedMetaBullet(content: string, name: MetaFieldName, value: string): string {
  const writer = writers[name];
  if (writer === undefined) throw new Error(`Cannot set meta field: \`${name}\` bullet not found.`);
  return writer(content, value);
}
