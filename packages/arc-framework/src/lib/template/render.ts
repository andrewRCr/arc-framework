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
    return key in tokens ? (tokens[key] ?? match) : match;
  });
}

/**
 * Process `<!-- arc:if KEY == VALUE -->` and `<!-- arc:if KEY != VALUE -->`
 * conditional blocks. Includes the block content when the condition matches,
 * removes it (including the directive lines) when it doesn't.
 *
 * Note: template conditionals support `==` and `!=`; recipe conditions
 * (recipe.ts) gate on `==` only.
 *
 * @param content - Template string with conditional directives
 * @param config - Map of dotted config keys to their values (e.g., `pm.mode` → `arc-in-git`)
 * @param sourcePath - Template path used in validation errors
 * @returns Content with conditional blocks resolved and directive lines removed
 */
export function renderConditionals(
  content: string,
  config: Record<string, string>,
  sourcePath = "<template>",
): string {
  const lines = content.split("\n");
  const result: string[] = [];
  const includeStack: boolean[] = [];
  const openingLines: number[] = [];
  let including = true;

  for (const [index, line] of lines.entries()) {
    const ifMatch = line.match(
      /^\s*<!--\s*arc:if\s+([\w.]+)\s*(==|!=)\s*(\S+)\s*-->\s*$/,
    );
    const endifMatch = line.match(/^\s*<!--\s*arc:endif\s*-->\s*$/);

    if (ifMatch) {
      includeStack.push(including);
      openingLines.push(index + 1);
      if (including) {
        const [, key = "", operator = "", value = ""] = ifMatch;
        including = operator === "==" ? config[key] === value : config[key] !== value;
      }
      // If already excluding, nested blocks stay excluded
    } else if (endifMatch) {
      const parentIncluding = includeStack.pop();
      if (parentIncluding === undefined) {
        throw new Error(`Stray arc:endif directive at ${sourcePath}:${index + 1}`);
      }
      including = parentIncluding;
      openingLines.pop();
    } else if (including) {
      result.push(line);
    }
  }

  const unclosedLine = openingLines.at(-1);
  if (unclosedLine !== undefined) {
    throw new Error(`Unclosed arc:if directive at ${sourcePath}:${unclosedLine}`);
  }

  // Collapse multiple consecutive blank lines left behind by stripped blocks,
  // and normalize trailing newlines to exactly one. Template authors shouldn't
  // need to contort formatting around conditionals, and rendered output must
  // end with a single newline (MD012/MD047).
  return result.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "\n");
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
      const configKey = m?.[1];
      return configKey && configKey in overrides
        ? `${configKey}: ${overrides[configKey]}`
        : line;
    })
    .join("\n");
}
