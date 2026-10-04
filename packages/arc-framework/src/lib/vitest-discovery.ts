/** Native configured specification discovery before test admission or runtime preparation. */
import { closeVitestController } from "./vitest-closing.js";
import { createVitest, type TestSpecification, type Vitest, type CliOptions } from "vitest/node";

/** One initialized controller and its configured native selection. */
export interface VitestSelection {
  readonly controller: Vitest;
  readonly specifications: TestSpecification[];
  readonly requiresRuntime: boolean;
}

/**
 * Initialize native reporting once and discover without executing setups or workers.
 * @param filters - Native package-relative filename filters
 * @param options - Parsed native options
 * @returns Controller and configured selection for the caller's owning execution
 */
export async function discoverVitestSelection(filters: string[], options: CliOptions): Promise<VitestSelection> {
  process.env.TEST = "true";
  process.env.VITEST = "true";
  process.env.NODE_ENV ??= "test";
  const controller = await createVitest("test", normalizeVitestOptions(filters, options));
  try {
    await controller.standalone();
    let specifications = await controller.getRelevantTestSpecifications(filters);
    if (controller.config.experimental.preParse) {
      const modules = await controller.experimental_parseSpecifications(specifications);
      const failed = modules.filter((module) => module.errors().length > 0);
      for (const module of failed) {
        controller.logger.error(`Parsing ${module.moduleId} failed:`);
        for (const error of module.errors()) controller.logger.printError(error, { project: module.project });
      }
      if (failed.length > 0) throw new Error("Native test specification parsing failed.");
      specifications = specifications.filter((specification) => !isNativeSkippedSpecification(specification));
    }
    if (specifications.length === 0) throw new Error("No configured test specifications match the selection.");
    return { controller, specifications, requiresRuntime: specifications.some(({ project }) =>
      project.name !== "unit" && project.name !== "unit-mocks") };
  } catch (error) {
    await closeVitestController(controller);
    throw error;
  }
}

function isNativeSkippedSpecification({ testModule }: TestSpecification): boolean {
  if (testModule === undefined) return false;
  // Vitest's start predicate reads this native field; its public declaration omits it.
  if (!("task" in testModule) || typeof testModule.task !== "object" || testModule.task === null
    || !("mode" in testModule.task) || typeof testModule.task.mode !== "string") {
    throw new Error("Native pre-parsed module does not expose a task mode.");
  }
  return testModule.task.mode === "skip";
}

/**
 * Mirror native run-mode option normalization before controller configuration.
 * @param filters - Native filename filters, including supported line suffixes
 * @param options - Parsed native CLI options
 * @returns Options for public controller creation
 */
export function normalizeVitestOptions(filters: string[], options: CliOptions): CliOptions {
  const { exclude, ...normalized } = options;
  return { ...normalized, watch: options.run ? false : options.watch,
    ...(exclude === undefined ? {} : { cliExclude: exclude }),
    ...(filters.some((filter) => filter.includes(":")) && options.includeTaskLocation === undefined
      ? { includeTaskLocation: true } : {}) };
}
