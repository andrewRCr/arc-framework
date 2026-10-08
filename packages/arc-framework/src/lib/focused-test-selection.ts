/** Exact configured focused selection before optional native pre-parsing. */
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { TestSpecification } from "vitest/node";
import { discoverVitestSelection, type VitestSelection } from "./vitest-discovery.js";
import type { FocusedTestInput, FocusedTestTarget } from "./focused-test-input.js";

/**
 * Discover focused operands in the consuming package's fixed configuration.
 * @param input - Validated root operands and native execution options
 * @returns Initialized controller and exact configured selection
 */
export async function discoverFocusedVitestSelection(input: FocusedTestInput): Promise<VitestSelection> {
  return await discoverVitestSelection(input.targets.map((target) => target.path),
    { ...input.options, root: input.packageRoot, config: join(input.packageRoot, "vitest.config.ts") },
    (specifications) => selectExactSpecifications(input.targets, specifications));
}

/**
 * Require each operand to contribute configured membership and retain native order.
 * @param targets - Validated absolute file or directory operands
 * @param specifications - Native configured candidates after project filtering
 * @returns Deduplicated exact selection in native discovery order
 */
export function selectExactSpecifications(targets: readonly FocusedTestTarget[], specifications: TestSpecification[]): TestSpecification[] {
  const selected = new Set<TestSpecification>();
  for (const target of targets) {
    const contribution = specifications.filter((specification) => matchesTarget(target, resolve(specification.moduleId)));
    if (contribution.length === 0) {
      throw new Error(`Focused target ${target.operand} contributes no eligible configured test specifications; `
        + "check project filters and package configuration.");
    }
    for (const specification of contribution) selected.add(specification);
  }
  return specifications.filter((specification) => selected.has(specification));
}

function matchesTarget(target: FocusedTestTarget, path: string): boolean {
  if (target.kind === "file") return path === target.path;
  const key = relative(target.path, path);
  return key !== ".." && !key.startsWith(`..${sep}`) && !isAbsolute(key);
}
