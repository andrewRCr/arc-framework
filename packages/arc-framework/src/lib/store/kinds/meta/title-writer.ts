/** Work-unit title editing without touching metadata fields or body prose. */

import type { Slug } from "../../../kernel/schema/slug.js";
import { locateMetaFieldBlock } from "./line-reading.js";

/** Render the work-unit slug in the metadata H1.
 * @param content - Anchored metadata Markdown.
 * @param value - Work-unit slug to render.
 * @returns Markdown with only its H1 replaced.
 * @throws When the metadata H1 or its closing rule is absent.
 */
export function writeMetaTitle(content: string, value: Slug): string {
  const block = locateMetaFieldBlock(content);
  const heading = block.lines[block.h1Index];
  if (heading === undefined) throw new Error("Cannot edit metadata: missing H1 field-block anchor.");
  const replacement = `# Metadata: ${value}${heading.lineEnding}`;
  return `${content.slice(0, heading.startOffset)}${replacement}${content.slice(heading.endOffset)}`;
}
