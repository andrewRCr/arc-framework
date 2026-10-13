/** Typed field writers that rewrite only the metadata core table. */

import type { MetaPriority, MetaWorkClass } from "../../../active/meta-schema.js";
import type { WorkUnitState } from "../../../kernel/index.js";
import type { Slug } from "../../../kernel/schema/slug.js";
import { locateMetaCoreTable, locateMetaFieldBlock } from "./line-reading.js";
import { renderCoreTable } from "./projection.js";

function writeCoreField(content: string, name: string, value: string): string {
  const block = locateMetaFieldBlock(content);
  const start = block.lines[block.h1Index]?.endOffset ?? 0;
  const end = block.lines[block.fieldEndIndex]?.startOffset ?? content.length;
  const located = locateMetaCoreTable(content.slice(start, end));
  const rendered = renderCoreTable((field) =>
    field.name === name ? value : located.values.get(field.name) ?? field.default);
  const replacement = rendered.map((line, index) => `${line}${located.lineEndings[index] ?? ""}`).join("");
  return `${content.slice(0, start + located.startOffset)}${replacement}${content.slice(start + located.endOffset)}`;
}

/** Write the State cell in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic State value.
 * @returns Markdown with only the three core-table rows rewritten.
 * @throws When metadata anchors or the core table are missing or malformed.
 */
export function writeMetaState(content: string, value: WorkUnitState): string {
  return writeCoreField(content, "State", value);
}

/** Write the Owner cell in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Owner value.
 * @returns Markdown with only the three core-table rows rewritten.
 * @throws When metadata anchors or the core table are missing or malformed.
 */
export function writeMetaOwner(content: string, value: Slug): string {
  return writeCoreField(content, "Owner", value);
}

/** Write the Branch cell in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Branch value.
 * @returns Markdown with only the three core-table rows rewritten.
 * @throws When metadata anchors or the core table are missing or malformed.
 */
export function writeMetaBranch(content: string, value: string | null): string {
  return writeCoreField(content, "Branch", value ?? "[none]");
}

/** Write the Class cell in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Class value.
 * @returns Markdown with only the three core-table rows rewritten.
 * @throws When metadata anchors or the core table are missing or malformed.
 */
export function writeMetaClass(content: string, value: MetaWorkClass): string {
  return writeCoreField(content, "Class", value === "TBD" ? "[TBD]" : value);
}

/** Write the Priority cell in its canonical form.
 * @param content - Anchored metadata Markdown.
 * @param value - Semantic Priority value.
 * @returns Markdown with only the three core-table rows rewritten.
 * @throws When metadata anchors or the core table are missing or malformed.
 */
export function writeMetaPriority(content: string, value: MetaPriority): string {
  return writeCoreField(content, "Priority", value === "TBD" ? "[TBD]" : value);
}
