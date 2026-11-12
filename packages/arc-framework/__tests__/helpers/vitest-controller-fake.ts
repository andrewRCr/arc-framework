/** Faithful public controller results and lifecycle without native workers or preparation. */
import type { createVitest, TestResult, TestRunResult, TestSpecification, Vitest } from "vitest/node";

/** A configured specification's public identity and native pre-parsing mode. */
export interface FakeSpecificationInput {
  readonly path: string;
  readonly project: string;
  readonly mode?: "run" | "skip";
}

/**
 * Construct a public result with native completed, skipped, or pending states.
 * @param states - Case results exposed by the module
 * @param fault - Native module or worker failure channel
 * @returns Public execution result used by completion policy
 */
export function fakeVitestResult(states: TestResult["state"][], fault?: "module" | "collection" | "worker"): TestRunResult {
  const errors = [{ name: "Error", message: "native failure retained" }];
  const tests = states.map((state) => ({ meta: () => ({}), result: (): TestResult => state === "skipped"
    ? { state, errors: undefined, note: undefined }
    : state === "failed" ? { state, errors } : { state, errors: undefined } }));
  return { testModules: [{ meta: () => ({}), moduleId: "/tests/fake.test.ts", project: { name: "unit" },
    ok: () => fault !== "module", errors: () => fault === "collection" ? errors : [],
    children: { allTests: () => tests } }], unhandledErrors: fault === "worker" ? errors : [] } as unknown as TestRunResult;
}

/**
 * Provide only the public methods used by discovery, execution, and closing.
 * @param inputs - Configured native specifications supplied by the boundary
 * @param options - Parsing, execution, and closing outcomes
 * @returns Fake factory, controller, and observable lifecycle/diagnostics
 */
export function makeVitestControllerFake(inputs: readonly FakeSpecificationInput[], options: {
  preParse?: boolean; parseFailure?: boolean; result?: TestRunResult;
  executionError?: Error; closingError?: Error; closingDiagnostic?: string;
} = {}): {
  create: typeof createVitest; controller: Vitest; specifications: TestSpecification[];
  events: string[]; diagnostics: string[];
} {
  const events: string[] = [];
  const diagnostics: string[] = [];
  const projects = [...new Set(inputs.map(({ project }) => project))].map((name) => ({ name, config: { exclude: ["configured"] } }));
  const specifications = inputs.map(({ path, project }) => ({ moduleId: path,
    project: projects.find(({ name }) => name === project), testModule: undefined })) as unknown as TestSpecification[];
  const provided: Record<string, unknown> = {};
  const controller = {
    config: { experimental: { preParse: options.preParse ?? false } }, projects,
    standalone: async () => { events.push("initialized"); },
    getRelevantTestSpecifications: async () => specifications,
    experimental_parseSpecifications: async () => {
      for (const [index, specification] of specifications.entries()) Object.assign(specification,
        { testModule: { task: { mode: inputs[index]?.mode ?? "run" } } });
      return [{ moduleId: "broken.test.ts", project: projects[0], errors: () => options.parseFailure
        ? [{ name: "Error", message: "parse failure retained" }] : [] }];
    },
    runTestSpecifications: async () => {
      events.push("executed");
      if (options.executionError !== undefined) throw options.executionError;
      return options.result ?? fakeVitestResult(["passed"]);
    },
    close: async () => {
      events.push("closed");
      if (options.closingDiagnostic !== undefined) controller.logger.error(options.closingDiagnostic);
      if (options.closingError !== undefined) throw options.closingError;
    },
    provide: (key: string, value: unknown) => { provided[key] = value; }, getProvidedContext: () => provided,
    state: { getUnhandledErrors: () => [] },
    logger: { error: (...values: unknown[]) => { diagnostics.push(values.map(String).join(" ")); },
      printError: (error: unknown) => { diagnostics.push(error !== null && typeof error === "object" && "message" in error
        ? String(error.message) : String(error)); },
      printUnhandledErrors: (errors: unknown[]) => { diagnostics.push(...errors.map(String)); } },
  };
  const create: typeof createVitest = async () => controller as unknown as Vitest;
  return { create, controller: controller as unknown as Vitest, specifications, events, diagnostics };
}
