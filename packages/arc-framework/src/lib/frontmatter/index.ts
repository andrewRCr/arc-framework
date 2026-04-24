/**
 * Frontmatter parsing — generic extractor + schema-specific validators.
 *
 * Consumers:
 * - `parseFrontmatter`: schema-neutral extraction used by the audit script
 *   and as the first step inside each schema parser.
 * - `parseMethodFrontmatter` / `parseExtensionFrontmatter` / `parseAgentFrontmatter`:
 *   validate per-file method, extension, and agent-file frontmatter against
 *   their respective schemas.
 */

export { parseFrontmatter } from "./generic.js";
export type { ParsedFrontmatter } from "./generic.js";

export { parseMethodFrontmatter } from "./method.js";
export type {
  MethodFrontmatter,
  MethodParseResult,
} from "./method.js";

export { parseExtensionFrontmatter } from "./extension.js";
export type {
  ExtensionFrontmatter,
  ExtensionParseResult,
} from "./extension.js";

export { parseAgentFrontmatter } from "./agent.js";
export type {
  AgentFrontmatter,
  AgentParseResult,
} from "./agent.js";

export { parseDevRulesFrontmatter } from "./dev-rules.js";
export type {
  DevRulesFrontmatter,
  DevRulesParseResult,
} from "./dev-rules.js";
