/** Strict CLI parsing for test-cost capture; measurement-mode axes never default. */

import { createMeasurementMode, type MeasurementMode } from "./mode.js";

export interface TestCostCliInput {
  readonly mode: MeasurementMode;
  readonly outputPath?: string;
}

export function parseTestCostCli(argv: readonly string[]): TestCostCliInput {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--") || value.startsWith("--")) {
      throw new Error("Test-cost arguments must be complete --name value pairs");
    }
    if (values.has(key)) throw new Error(`Duplicate test-cost argument: ${key}`);
    if (!["--condition", "--project-set", "--workers", "--output"].includes(key)) {
      throw new Error(`Unknown test-cost argument: ${key}`);
    }
    values.set(key, value);
  }
  return {
    mode: createMeasurementMode({
      condition: values.get("--condition") as MeasurementMode["condition"] | undefined,
      projectSet: values.get("--project-set") as MeasurementMode["projectSet"] | undefined,
      workerSizing: values.get("--workers"),
    }),
    ...(values.has("--output") ? { outputPath: values.get("--output") } : {}),
  };
}
