/**
 * Frontmatter parsing — generic extractor + schema-specific validators.
 *
 * Consumers:
 * - `parseFrontmatter`: schema-neutral extraction used by the audit script
 *   and as the first step inside each schema parser.
 * - `parseMethodFrontmatter`: validate per-file method frontmatter.
 */

export { parseFrontmatter } from "./generic.js";
export type { ParsedFrontmatter } from "./generic.js";

export { parseMethodFrontmatter } from "./method.js";
export type {
  MethodFrontmatter,
  MethodParseResult,
} from "./method.js";

export { parseDevRulesFrontmatter } from "./dev-rules.js";
export type {
  DevRulesFrontmatter,
  DevRulesParseResult,
} from "./dev-rules.js";
