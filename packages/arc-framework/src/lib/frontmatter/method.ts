/**
 * Method-file frontmatter schema parser.
 *
 * Validates the required fields (name, description, override-active) and
 * optional `arc.methods` dependencies, `related` (array), `override-mode`
 * (`replace` | `extend`), and registry-scoped `active` boolean.
 * Enforces that `name` matches the file basename — the structural contract
 * that ties registration to filesystem location.
 *
 * @module
 */

import { isStringArray, unknownFrontmatterFields, validateFrontmatterShape } from "./generic.js";
import { isActivatableMethodName } from "../method-activation-registry.js";

const METHOD_FRONTMATTER_FIELDS = new Set([
  "name",
  "description",
  "override-active",
  "active",
  "related",
  "override-mode",
  "review-augmentation",
  "arc",
]);

const METHOD_ARC_FRONTMATTER_FIELDS = new Set(["methods"]);

/** Validated method frontmatter. */
export interface MethodFrontmatter {
  name: string;
  description: string;
  "override-active": boolean;
  active?: boolean;
  related?: string[];
  "override-mode"?: "replace" | "extend";
  "review-augmentation"?: unknown;
  arc?: { methods?: string[] };
}

/** Parse result: frontmatter is present when errors is empty. */
export interface MethodParseResult {
  frontmatter?: MethodFrontmatter;
  errors: string[];
}

/**
 * Parse and validate a method file's frontmatter against the method schema.
 *
 * @param content - Full file contents
 * @param basename - File basename without `.md` (e.g., `commit-format`)
 * @returns `{ frontmatter, errors }` — `frontmatter` is set only when errors is empty.
 */
export function parseMethodFrontmatter(
  content: string,
  basename: string,
): MethodParseResult {
  const shape = validateFrontmatterShape(content);
  if (!shape.ok) return { errors: shape.errors };
  const data = shape.data;
  const errors = unknownFrontmatterFields(data, METHOD_FRONTMATTER_FIELDS);

  const name = data.name;
  const description = data.description;
  const overrideActive = data["override-active"];
  const active = data.active;
  const related = data.related;
  const overrideMode = data["override-mode"];
  const reviewAugmentation = data["review-augmentation"];
  const arc = data.arc;
  let methodDependencies: string[] | undefined;

  if (typeof name !== "string") errors.push("missing or invalid `name` (expected string)");
  if (typeof description !== "string") errors.push("missing or invalid `description` (expected string)");
  if (typeof overrideActive !== "boolean") errors.push("missing or invalid `override-active` (expected boolean)");
  if (active !== undefined) {
    if (!isActivatableMethodName(basename)) {
      errors.push("`active` is only valid for a registered activatable method");
    } else if (typeof active !== "boolean") {
      errors.push("invalid `active` (expected boolean)");
    }
  }
  if (related !== undefined && !isStringArray(related)) {
    errors.push("invalid `related` (expected array of strings)");
  }
  if (overrideMode !== undefined && overrideMode !== "replace" && overrideMode !== "extend") {
    errors.push('invalid `override-mode` (expected "replace" or "extend")');
  }
  if (arc !== undefined) {
    if (arc === null || typeof arc !== "object" || Array.isArray(arc)) {
      errors.push("invalid `arc` (expected mapping)");
    } else {
      const arcData = arc as Record<string, unknown>;
      errors.push(...Object.keys(arcData)
        .filter((key) => !METHOD_ARC_FRONTMATTER_FIELDS.has(key))
        .sort()
        .map((key) => `unknown method \`arc\` frontmatter field \`${key}\``));
      if (arcData.methods !== undefined) {
        if (!isStringArray(arcData.methods)) {
          errors.push("invalid `arc.methods` (expected array of strings)");
        } else {
          methodDependencies = arcData.methods;
        }
      }
    }
  }
  if (typeof name === "string" && name !== basename) {
    errors.push(`\`name\` "${name}" does not match file basename "${basename}"`);
  }

  if (errors.length > 0) return { errors };

  const frontmatter: MethodFrontmatter = {
    name: name as string,
    description: description as string,
    "override-active": overrideActive as boolean,
  };
  if (active !== undefined) frontmatter.active = active as boolean;
  if (related !== undefined) frontmatter.related = related as string[];
  if (overrideMode !== undefined) frontmatter["override-mode"] = overrideMode as "replace" | "extend";
  if (reviewAugmentation !== undefined) frontmatter["review-augmentation"] = reviewAugmentation;
  if (arc !== undefined) frontmatter.arc = methodDependencies === undefined ? {} : { methods: methodDependencies };
  return { frontmatter, errors: [] };
}
