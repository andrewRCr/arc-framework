/** Targeted field rewrites that make a renamed work-unit meta self-consistent. */

import {
  formatValue,
  parseMetaRecord,
  setMetaBranch,
  setMetaBulletFields,
  setMetaDesign,
  setMetaTitle,
} from "../../active/meta-reader.js";

/**
 * Rewrite every slug-bearing identity field in one renamed meta projection.
 *
 * @param content - Renamed meta content
 * @param sourceSlug - Previous work-unit slug
 * @param targetSlug - New work-unit slug
 * @returns Self-consistent renamed meta content
 */
export function rewriteRenamedMeta(content: string, sourceSlug: string, targetSlug: string): string {
  const record = parseMetaRecord(content);
  let rewritten = setMetaTitle(content, targetSlug);
  const branch = record.branch;
  if (branch !== null && branch.endsWith(`/${sourceSlug}`)) {
    rewritten = setMetaBranch(rewritten, `${branch.slice(0, -(sourceSlug.length))}${targetSlug}`);
  }

  const design = rewriteIdentifiers(record.design, sourceSlug, targetSlug);
  if (design !== null) rewritten = setMetaDesign(rewritten, design.join(", "));
  const taskList = rewriteArtifactPointer(record.taskList, sourceSlug, targetSlug);
  if (taskList !== null) {
    rewritten = setMetaBulletFields(rewritten, { "Task List": formatValue(taskList, "identifier-list") });
  }
  return rewritten;
}

function rewriteIdentifiers(
  items: readonly string[],
  sourceSlug: string,
  targetSlug: string,
): string[] | null {
  const suffix = `-${sourceSlug}.md`;
  const rewritten = items.map((item) => {
    if (!item.endsWith(suffix)) return item;
    return `${item.slice(0, -suffix.length)}-${targetSlug}.md`;
  });
  return rewritten.some((item, index) => item !== items[index]) ? rewritten : null;
}

function rewriteArtifactPointer(
  value: string | null,
  sourceSlug: string,
  targetSlug: string,
): string | null {
  if (value === null) return null;
  return rewriteIdentifiers([value], sourceSlug, targetSlug)?.[0] ?? null;
}
