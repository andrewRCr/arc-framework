/**
 * Start the slowest test files first within their project.
 *
 * With no results cache, as on every CI run, Vitest starts the largest files on disk first. A few end-to-end files
 * are slow but small, so they started last and ran alone while the rest of the worker pool sat idle, setting their
 * shard's wall time. Promoting them keeps every worker busy through the tail of the run.
 */
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { BaseSequencer, type TestSpecification } from "vitest/node";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

/** Package-relative files to start first, slowest first, as measured on a 4-vCPU hosted CI runner. */
export const HEAVY_FIRST_FILES = [
  "__tests__/e2e/candidate-lineage.e2e.test.ts",
  "__tests__/e2e/publication-spine.e2e.test.ts",
  "__tests__/e2e/errand.e2e.test.ts",
  "__tests__/e2e/command-input-no-input.e2e.test.ts",
  "__tests__/e2e/lifecycle-exit.e2e.test.ts",
  "__tests__/e2e/integrate-base-movement.e2e.test.ts",
] as const;

/** Vitest's default order, with each project's listed files moved to the front of that project's run. */
export class HeavyFirstSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return promoteHeavyFirst(await super.sort(files), HEAVY_FIRST_FILES, (specification) => ({
      project: specification.project.name,
      file: relative(packageRoot, specification.moduleId).replaceAll("\\", "/"),
    }));
  }
}

/**
 * Move listed files to the front of each contiguous same-project run, in list order.
 * @param ordered - Files in their base execution order
 * @param heavy - Package-relative files to promote, in the order to start them
 * @param identify - Reads an entry's project name and package-relative file
 * @returns The same entries with listed files leading their project's run and every other entry in base order
 */
export function promoteHeavyFirst<T>(
  ordered: readonly T[],
  heavy: readonly string[],
  identify: (entry: T) => { project: string; file: string },
): T[] {
  const rank = new Map(heavy.map((file, index) => [file, index]));
  const promoted: T[] = [];
  let run: T[] = [];
  let runProject: string | undefined;
  const flush = (): void => {
    const listed = run.filter((entry) => rank.has(identify(entry).file));
    listed.sort((left, right) => (rank.get(identify(left).file) ?? 0) - (rank.get(identify(right).file) ?? 0));
    promoted.push(...listed, ...run.filter((entry) => !rank.has(identify(entry).file)));
    run = [];
  };
  for (const entry of ordered) {
    const { project } = identify(entry);
    if (project !== runProject) {
      flush();
      runProject = project;
    }
    run.push(entry);
  }
  flush();
  return promoted;
}
