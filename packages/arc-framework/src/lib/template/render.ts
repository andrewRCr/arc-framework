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
 * Process `<!-- arc:if KEY == VALUE -->` and `<!-- arc:if KEY != VALUE -->`
 * conditional blocks. Includes the block content when the condition matches,
 * removes it (including the directive lines) when it doesn't.
 *
 * Note: template conditionals use `==` and `!=` operators for simple equality.
 * Recipe conditions (recipe.ts) use `==` and `includes` operators — the
 * `includes` operator supports set-membership checks on multiselect values.
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
  const includeStack: boolean[] = [];
  let including = true;

  for (const line of lines) {
    const ifMatch = line.match(
      /^\s*<!--\s*arc:if\s+([\w.]+)\s*(==|!=)\s*(\S+)\s*-->\s*$/,
    );
    const endifMatch = line.match(/^\s*<!--\s*arc:endif\s*-->\s*$/);

    if (ifMatch) {
      includeStack.push(including);
      if (including) {
        const key = ifMatch[1]!;
        const operator = ifMatch[2]!;
        const value = ifMatch[3]!;
        including = operator === "==" ? config[key] === value : config[key] !== value;
      }
      // If already excluding, nested blocks stay excluded
    } else if (endifMatch) {
      including = includeStack.pop() ?? true;
    } else if (including) {
      result.push(line);
    }
  }

  // Collapse multiple consecutive blank lines left behind by stripped blocks.
  // Template authors shouldn't need to contort formatting around conditionals.
  return result.join("\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * Override specific key-value lines in an arc-config.yml template.
 *
 * Matches lines of the form `key.name: value` and replaces the value
 * for keys present in the overrides map. Non-matching lines pass through
 * unchanged (comments, blank lines, etc.).
 *
 * @param content - Raw arc-config.yml template content
 * @param overrides - Map of dotted config keys to override values
 * @returns Content with matching keys overridden
 */
export function renderConfigOverrides(
  content: string,
  overrides: Record<string, string>,
): string {
  return content
    .split("\n")
    .map((line) => {
      const m = line.match(/^([\w.]+):\s*(.*)$/);
      return m && m[1]! in overrides
        ? `${m[1]}: ${overrides[m[1]!]}`
        : line;
    })
    .join("\n");
}
