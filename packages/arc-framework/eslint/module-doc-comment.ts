/** File-level doc comment check for native ESLint configuration. */

import type { Rule } from "eslint";
import ts from "typescript";

/** Whether a `/**` doc block sits among the comments before the module's first token, after any shebang. */
export function hasModuleDocComment(text: string): boolean {
  return (ts.getLeadingCommentRanges(text, 0) ?? []).some(({ kind, pos }) =>
    kind === ts.SyntaxKind.MultiLineCommentTrivia && text.startsWith("/**", pos) && !text.startsWith("/**/", pos));
}

/** Requires each linted module to open with a doc comment describing its purpose. */
export const moduleDocCommentRule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: { missing: "Open the module with a /** doc comment describing its purpose" },
  },
  create(context) {
    return {
      Program() {
        if (!hasModuleDocComment(context.sourceCode.text)) {
          context.report({ loc: { line: 1, column: 0 }, messageId: "missing" });
        }
      },
    };
  },
};
