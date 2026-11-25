/** Root lint operand bases with unchanged native ESLint tokens after the delimiter. */
import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * Normalize explicit root files, directories, and globs into the package cwd.
 * @param checkoutRoot - Invoking checkout boundary
 * @param args - Root targets before an optional delimiter, then native ESLint tokens
 * @returns Fixed package cwd and normalized native argv
 */
export function normalizeFocusedLintInput(checkoutRoot: string, args: readonly string[]): {
  packageRoot: string; arguments: string[];
} {
  const delimiter = args.indexOf("--");
  const targets = delimiter === -1 ? args : args.slice(0, delimiter);
  if (targets.length === 0 || targets.some((target) => target.length === 0 || target.startsWith("-") || isAbsolute(target))) {
    throw new Error("Provide at least one repository-relative lint target before optional --; place native ESLint options after it.");
  }
  const packageRoot = resolve(checkoutRoot, "packages/arc-framework");
  const normalized = targets.map((target) => {
    const path = relative(packageRoot, resolve(checkoutRoot, target)) || ".";
    return sep === "\\" ? path.replaceAll("\\", "/") : path;
  });
  return { packageRoot, arguments: [...normalized, ...(delimiter === -1 ? [] : args.slice(delimiter + 1))] };
}
