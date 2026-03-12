/**
 * Template rendering — token substitution and conditional content processing.
 *
 * Pure-function core used by init (to render templates) and update (to
 * reconstruct pristine baselines from stored install config).
 */

/**
 * Replace `{{TOKEN}}` placeholders in content with values from the provided map.
 * Unknown tokens are left as-is.
 *
 * @param content - Template string containing `{{TOKEN}}` placeholders
 * @param tokens - Map of token names to replacement values
 * @returns Rendered string with known tokens replaced
 */
export function renderTokens(
  content: string,
  tokens: Record<string, string>,
): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return key in tokens ? tokens[key]! : match;
  });
}

/**
 * Process `<!-- arc:if KEY == VALUE -->` / `<!-- arc:endif -->` conditional blocks.
 * Includes the block content when the condition matches, removes it (including
 * the directive lines) when it doesn't. Supports simple equality checks only.
 *
 * @param content - Template string with conditional directives
 * @param config - Map of dotted config keys to their values (e.g., `pm.mode` → `arc-in-git`)
 * @returns Content with conditional blocks resolved and directive lines removed
 */
export function renderConditionals(
  content: string,
  config: Record<string, string>,
): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let depth = 0;
  let includeDepth = 0;
  let including = true;

  for (const line of lines) {
    const ifMatch = line.match(
      /^\s*<!--\s*arc:if\s+([\w.]+)\s*==\s*(\S+)\s*-->\s*$/,
    );
    const endifMatch = line.match(/^\s*<!--\s*arc:endif\s*-->\s*$/);

    if (ifMatch) {
      depth++;
      if (including) {
        const key = ifMatch[1]!;
        const value = ifMatch[2]!;
        if (config[key] === value) {
          includeDepth = depth;
        } else {
          including = false;
          includeDepth = depth - 1;
        }
      }
    } else if (endifMatch) {
      if (!including && depth === includeDepth + 1) {
        including = true;
      }
      depth--;
    } else if (including) {
      result.push(line);
    }
  }

  return result.join("\n");
}
