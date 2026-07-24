/** Project method-frontmatter resolution over the typed package activation registry. */

import { parseMethodFrontmatter } from "./frontmatter/method.js";
import {
  defaultMethodActivation,
  type ActivatableMethodName,
} from "./method-activation-registry.js";

/** Read-side port for project method files; missing files return `undefined` or `null`. */
export interface MethodActivationFilePort {
  readMethodFile(name: ActivatableMethodName): unknown;
}

/** One effective activation and its authority source. */
export interface MethodActivationResolution {
  readonly active: boolean;
  readonly source: "project" | "package-default";
  readonly diagnostics: readonly string[];
}

function fallback(name: ActivatableMethodName, diagnostics: string[]): MethodActivationResolution {
  return {
    active: defaultMethodActivation(name),
    source: "package-default",
    diagnostics,
  };
}

/** Resolve project activation or diagnose and fall back to the registered package default. */
export function resolveMethodActivation(
  name: ActivatableMethodName,
  port: MethodActivationFilePort,
): MethodActivationResolution {
  let observed: unknown;
  try {
    observed = port.readMethodFile(name);
  } catch {
    return fallback(name, [`method.${name}.read-failed`]);
  }
  if (observed === undefined || observed === null) {
    return fallback(name, [`method.${name}.missing`]);
  }
  if (typeof observed !== "string") {
    return fallback(name, [`method.${name}.malformed-file`]);
  }

  const parsed = parseMethodFrontmatter(observed, name);
  if (parsed.frontmatter === undefined) {
    return fallback(name, parsed.errors.map((error) => `method.${name}.frontmatter:${error}`));
  }
  if (parsed.frontmatter.active === undefined) {
    return fallback(name, [`method.${name}.active-missing`]);
  }
  return { active: parsed.frontmatter.active, source: "project", diagnostics: [] };
}
