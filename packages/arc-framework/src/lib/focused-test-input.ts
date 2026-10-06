/** Repository-root focused test input before native discovery or ownership. */
import { statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { validateFocusedTestArguments, validateFocusedTestOptions } from "./focused-test-options.js";
import { parseCLI, type CliOptions } from "vitest/node";

/** One explicit repository operand retained through native project selection. */
export interface FocusedTestTarget {
  readonly operand: string;
  readonly path: string;
  readonly kind: "file" | "directory";
}

/** Fixed-package input plus native execution options. */
export interface FocusedTestInput {
  readonly packageRoot: string;
  readonly targets: FocusedTestTarget[];
  readonly options: CliOptions;
}

/**
 * Parse native flags while retaining root operands for explicit validation.
 * @param checkoutRoot - Fixed consuming checkout root
 * @param args - Root targets and native execution flags
 * @returns Fixed package, validated targets, and native options
 */
export function parseFocusedTestInput(checkoutRoot: string, args: string[]): FocusedTestInput {
  validateFocusedTestArguments(args);
  let parsed: ReturnType<typeof parseCLI>;
  try { parsed = parseCLI(["vitest", "run", ...args]); }
  catch (error) { throw new Error(`Malformed focused Vitest arguments: ${String(error)}`, { cause: error }); }
  const { filter, options } = parsed;
  validateFocusedTestOptions(options);
  if (filter.length === 0) throw new Error("Focused tests require at least one repository-relative target.");
  const packageRoot = resolve(checkoutRoot, "packages/arc-framework");
  const targets = filter.map((operand) => resolveFocusedTarget(checkoutRoot, packageRoot, operand));
  return { packageRoot, options, targets };
}

function resolveFocusedTarget(checkoutRoot: string, packageRoot: string, operand: string): FocusedTestTarget {
  const path = resolve(checkoutRoot, operand);
  const eligible = ["unit", "integration", "e2e"].some((tree) => {
    const key = relative(resolve(packageRoot, "__tests__", tree), path);
    return key !== ".." && !key.startsWith(`..${sep}`) && !isAbsolute(key);
  });
  if (isAbsolute(operand) || !eligible) {
    throw new Error(`Focused target ${operand} must be repository-relative beneath the unit, integration, or E2E test tree.`);
  }
  try {
    const status = statSync(path);
    if (status.isFile()) return { operand, path, kind: "file" };
    if (status.isDirectory()) return { operand, path, kind: "directory" };
  } catch { throw new Error(`Focused target ${operand} does not exist or cannot be read.`); }
  throw new Error(`Focused target ${operand} must be an existing file or directory.`);
}
