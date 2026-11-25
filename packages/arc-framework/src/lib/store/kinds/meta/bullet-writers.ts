/** Typed writers for individual metadata bullets and their continuations. */

import type { MetaRecord } from "../../../active/meta-schema.js";
import { META_FIELDS, renderMetaBullet, renderIdentifierList, renderNullable, type MetaFieldDescriptor } from "./projection.js";
import { FIELD_MARKER_RE, extractField, stripInlineCode, locateMetaFieldBlock, type MetaFieldBlockLocation } from "./line-reading.js";

interface BulletSpan {
  readonly field: MetaFieldDescriptor;
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly lineEnding: string;
}

function bulletEndIndex(block: MetaFieldBlockLocation, index: number): number {
  let end = index + 1;
  for (; end < block.closingIndex; end += 1) {
    const line = block.lines[end]?.text;
    if (line === undefined || line.trim() === "" || FIELD_MARKER_RE.test(line)
      || /^#{1,6} /u.test(line) || line.trim() === "---" || !/^\s/u.test(line)) break;
  }
  return end;
}

function bulletSpans(block: MetaFieldBlockLocation): BulletSpan[] {
  return block.lines.flatMap((line, index) => {
    if (index <= block.h1Index || index >= block.fieldEndIndex) return [];
    const label = /^[ \t>*+-]*\*\*([^*]+):\*\*/u.exec(line.text)?.[1];
    const field = META_FIELDS.find((candidate) => candidate.render === "bullet" && candidate.name === label);
    if (field === undefined) return [];
    const last = block.lines[bulletEndIndex(block, index) - 1] ?? line;
    return [{ field, index, start: line.startOffset, end: last.endOffset, lineEnding: line.lineEnding }];
  });
}

function fieldOrder(field: MetaFieldDescriptor): number {
  return META_FIELDS.findIndex((candidate) => candidate.name === field.name);
}

function insertBullet(content: string, block: MetaFieldBlockLocation, spans: readonly BulletSpan[],
  field: MetaFieldDescriptor, rendered: string, ending: string): string {
  const next = spans.find((span) => fieldOrder(span.field) > fieldOrder(field));
  const previous = spans.filter((span) => span.index < (next?.index ?? block.closingIndex)).at(-1);
  let offset: number;
  let insertion = rendered;
  if (previous?.field.group === field.group) {
    offset = previous.end;
  } else if (next !== undefined) {
    offset = next.start;
    if (next.field.group !== field.group) insertion += ending;
  } else if (previous !== undefined) {
    offset = previous.end;
    insertion = `${ending}${rendered}`;
  } else {
    const section = block.lines.find((line, index) => index > block.h1Index && index < block.closingIndex
      && /^## /u.test(line.text));
    offset = section?.startOffset ?? block.lines[block.closingIndex]?.startOffset ?? content.length;
    insertion += ending;
  }
  return `${content.slice(0, offset)}${insertion}${content.slice(offset)}`;
}

function writeBullet(content: string, name: string, value: string): string {
  const block = locateMetaFieldBlock(content);
  const field = META_FIELDS.find((candidate) => candidate.name === name && candidate.render === "bullet");
  if (field === undefined) throw new Error(`Cannot write unknown metadata bullet: ${name}.`);
  const spans = bulletSpans(block);
  const target = spans.find((span) => span.field.name === name);
  const omitted = "omitWhenAbsent" in field && value === field.default;
  if (omitted && target === undefined) return content;
  const ending = target?.lineEnding || block.lines[block.h1Index]?.lineEnding || "\n";
  const existingLine = target === undefined ? undefined : block.lines[target.index]?.text;
  const prefix = existingLine?.match(/^[ \t>*+-]*\*\*[^*]+:\*\*[ \t]*/u)?.[0];
  const rendered = omitted ? "" : renderMetaBullet(field, value, prefix).map((line) => `${line}${ending}`).join("");
  if (target === undefined) return insertBullet(content, block, spans, field, rendered, ending);
  return `${content.slice(0, target.start)}${rendered}${content.slice(target.end)}`;
}

/** Write the Cohort bullet in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Cohort value.
 * @returns Markdown with only this field's lines inserted, replaced, or removed.
 */
export function writeMetaCohort(content: string, value: MetaRecord["cohort"]): string {
  return writeBullet(content, "Cohort", renderNullable(value));
}

/** Write the Depends On bullet in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Depends On value.
 * @returns Markdown with only this field's lines inserted, replaced, or removed.
 */
export function writeMetaDependsOn(content: string, value: readonly string[]): string {
  return writeBullet(content, "Depends On", renderIdentifierList(value));
}

/** Write the Origin bullet in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Origin value.
 * @returns Markdown with only this field's lines inserted, replaced, or removed.
 */
export function writeMetaOrigin(content: string, value: MetaRecord["origin"]): string {
  return writeBullet(content, "Origin", value === "internal" ? "[internal]" : value);
}

/** Write the Design bullet in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Design value.
 * @returns Markdown with only this field's lines inserted, replaced, or removed.
 */
export function writeMetaDesign(content: string, value: readonly string[]): string {
  return writeBullet(content, "Design", renderIdentifierList(value));
}

/** Write the Task List bullet in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Task List value.
 * @returns Markdown with only this field's lines inserted, replaced, or removed.
 */
export function writeMetaTaskList(content: string, value: MetaRecord["taskList"]): string {
  return writeBullet(content, "Task List", renderNullable(value));
}

/** Write the Review Rubric bullet in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Review Rubric value.
 * @returns Markdown with only this field's lines inserted, replaced, or removed.
 */
export function writeMetaReviewRubric(content: string, value: MetaRecord["reviewRubric"]): string {
  return writeBullet(content, "Review Rubric", renderNullable(value));
}

/** Write the Promotion Receipt bullet in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Promotion Receipt value.
 * @returns Markdown with only this field's lines inserted, replaced, or removed.
 */
export function writeMetaPromotionReceipt(content: string, value: MetaRecord["promotionReceipt"]): string {
  const block = locateMetaFieldBlock(content);
  const region = content.slice(block.lines[block.h1Index]?.endOffset ?? 0,
    block.lines[block.fieldEndIndex]?.startOffset ?? content.length);
  const raw = extractField(region, "Promotion Receipt");
  const existing = raw === null || raw === "[none]" ? null : stripInlineCode(raw);
  if (existing !== null) {
    if (existing !== value) throw new Error("Cannot change metadata Promotion Receipt: the receipt is immutable.");
    return content;
  }
  return writeBullet(content, "Promotion Receipt", renderNullable(value));
}

/** Write the Candidate bullet in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Candidate value.
 * @returns Markdown with only this field's lines inserted, replaced, or removed.
 */
export function writeMetaCandidate(content: string, value: MetaRecord["candidateId"]): string {
  return writeBullet(content, "Candidate", renderNullable(value));
}

/** Write the Current Workflow bullet in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Current Workflow value.
 * @returns Markdown with only this field's lines inserted, replaced, or removed.
 */
export function writeMetaCurrentWorkflow(content: string, value: MetaRecord["currentWorkflow"]): string {
  return writeBullet(content, "Current Workflow", renderNullable(value));
}

/** Write the Last Completed bullet in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Last Completed value.
 * @returns Markdown with only this field's lines inserted, replaced, or removed.
 */
export function writeMetaLastCompleted(content: string, value: MetaRecord["lastCompleted"]): string {
  return writeBullet(content, "Last Completed", renderNullable(value));
}

/** Write the Next Task bullet in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Next Task value.
 * @returns Markdown with only this field's lines inserted, replaced, or removed.
 */
export function writeMetaNextTask(content: string, value: MetaRecord["nextTask"]): string {
  return writeBullet(content, "Next Task", renderNullable(value));
}

/** Write the Blockers bullet in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Blockers value.
 * @returns Markdown with only this field's lines inserted, replaced, or removed.
 */
export function writeMetaBlockers(content: string, value: MetaRecord["blockers"]): string {
  return writeBullet(content, "Blockers", renderNullable(value));
}

/** Write the Next Action bullet in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Next Action value.
 * @returns Markdown with only this field's lines inserted, replaced, or removed.
 */
export function writeMetaNextAction(content: string, value: MetaRecord["nextAction"]): string {
  return writeBullet(content, "Next Action", value ?? "—");
}

/** Write the State at Handoff bullet in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic State at Handoff value.
 * @returns Markdown with only this field's lines inserted, replaced, or removed.
 */
export function writeMetaStateAtHandoff(content: string, value: MetaRecord["stateAtHandoff"]): string {
  return writeBullet(content, "State at Handoff", renderNullable(value));
}

/** Write the Commit at Handoff bullet in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Commit at Handoff value.
 * @returns Markdown with only this field's lines inserted, replaced, or removed.
 */
export function writeMetaCommitAtHandoff(content: string, value: MetaRecord["commitAtHandoff"]): string {
  return writeBullet(content, "Commit at Handoff", renderNullable(value));
}

/** Write the Session Type bullet in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Session Type value.
 * @returns Markdown with only this field's lines inserted, replaced, or removed.
 */
export function writeMetaSessionType(content: string, value: MetaRecord["sessionType"]): string {
  return writeBullet(content, "Session Type", renderNullable(value));
}

/** Write the PR URL bullet in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic PR URL value.
 * @returns Markdown with only this field's lines inserted, replaced, or removed.
 */
export function writeMetaPrUrl(content: string, value: MetaRecord["prUrl"]): string {
  return writeBullet(content, "PR URL", renderNullable(value));
}

/** Write the Completed bullet in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Completed value.
 * @returns Markdown with only this field's lines inserted, replaced, or removed.
 */
export function writeMetaCompleted(content: string, value: MetaRecord["completed"]): string {
  return writeBullet(content, "Completed", renderNullable(value));
}
