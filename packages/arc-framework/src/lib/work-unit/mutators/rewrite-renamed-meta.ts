/** Targeted field rewrites that make a renamed work-unit meta self-consistent. */

import {
  formatValue,
  parseIdentifierList,
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
  const branch = record.Branch;
  if (branch !== null && branch !== "[none]" && branch.endsWith(`/${sourceSlug}`)) {
    rewritten = setMetaBranch(rewritten, `${branch.slice(0, -(sourceSlug.length))}${targetSlug}`);
  }

  const design = rewriteIdentifierList(record.Design, sourceSlug, targetSlug);
  if (design !== null) rewritten = setMetaDesign(rewritten, design);
  const taskList = rewriteIdentifierList(record["Task List"], sourceSlug, targetSlug);
  if (taskList !== null) {
    rewritten = setMetaBulletFields(rewritten, { "Task List": formatValue(taskList, "identifier-list") });
  }
  return rewritten;
}

function rewriteIdentifierList(value: string | null, sourceSlug: string, targetSlug: string): string | null {
  if (value === null || /^\[[^\]]+\]$/u.test(value)) return null;
  const suffix = `-${sourceSlug}.md`;
  const items = parseIdentifierList(value);
  const rewritten = items.map((item) => {
    if (!item.endsWith(suffix)) return item;
    return `${item.slice(0, -suffix.length)}-${targetSlug}.md`;
  });
  return rewritten.some((item, index) => item !== items[index]) ? rewritten.join(", ") : null;
}
