/** Value validation for the fixed focused native run interface. */
import type { CliOptions } from "vitest/node";

type ValueValidator = (value: unknown) => boolean;
const booleanFields = ["isolate", "fileParallelism", "allowOnly", "passWithNoTests", "dangerouslyIgnoreUnhandledErrors",
  "includeTaskLocation", "hideSkippedTests", "disableConsoleIntercept", "logHeapUsage", "color", "clearMocks",
  "mockReset", "restoreMocks", "unstubGlobals", "unstubEnvs", "globals", "detectAsyncLeaks"];
const booleanValue: ValueValidator = (value) => typeof value === "boolean";
const nonemptyString: ValueValidator = (value) => typeof value === "string" && value.length > 0;
const stringArray: ValueValidator = (value) => Array.isArray(value) && value.length > 0 && value.every(nonemptyString);
const nonnegativeNumber: ValueValidator = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const validators: Readonly<Record<string, ValueValidator>> = {
  ...Object.fromEntries(booleanFields.map((key) => [key, booleanValue])),
  run: (value) => value === true,
  "--": (value) => Array.isArray(value) && value.length === 0,
  pool: (value) => typeof value === "string" && ["forks", "threads", "vmForks", "vmThreads"].includes(value),
  maxWorkers: workerCount,
  project: stringArray, exclude: stringArray, reporter: stringArray,
  testNamePattern: regularExpression, t: regularExpression,
  testTimeout: nonnegativeNumber, hookTimeout: nonnegativeNumber, teardownTimeout: nonnegativeNumber,
  retry: (value) => nonnegativeNumber(value) && Number.isInteger(value),
  bail: (value) => nonnegativeNumber(value) && Number.isInteger(value),
  silent: (value) => typeof value === "boolean" || value === "passed-only",
  outputFile: nonemptyString,
};

function workerCount(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value > 0;
  return typeof value === "string" && /^\d+(?:\.\d+)?%$/u.test(value) && Number.parseFloat(value) > 0;
}

function nativeFieldName(value: string): string {
  return value.replace(/^no-/u, "").replace(/-([a-z])/gu, (_match: string, letter: string) => letter.toUpperCase());
}

function regularExpression(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try { new RegExp(value); return true; } catch { return false; }
}

/**
 * Check long-option spellings before native parsing can discard unknown fields.
 * @param args - Original root adapter arguments
 * @returns After enforcing one separator and the fixed run interface
 */
export function validateFocusedTestArguments(args: readonly string[]): void {
  if (args.includes("--")) throw new Error("Focused tests accept one npm separator; remove the additional literal --.");
  for (const argument of args) {
    const name = /^--([^=]+)(?:=|$)/u.exec(argument)?.[1];
    if (name === undefined) continue;
    const key = nativeFieldName(name);
    if (!Object.hasOwn(validators, key)) throw new Error(`Unsupported focused Vitest option: ${name}.`);
    if (key === "run") throw new Error("Focused tests use fixed run mode; omit --run.");
    const assigned = /^--([^=]+)=(.*)$/u.exec(argument);
    if (assigned !== null && booleanFields.includes(key) && assigned[2] !== "true" && assigned[2] !== "false") {
      throw new Error(`Malformed focused Vitest boolean: ${argument}. Use true, false, or the native --no- form.`);
    }
  }
}

/**
 * Reject unsupported parsed fields and malformed native values before discovery.
 * @param options - Public native parser result
 * @returns After validating native execution values
 */
export function validateFocusedTestOptions(options: CliOptions): void {
  for (const key of Object.keys(options)) {
    const validate = validators[key];
    if (!Object.hasOwn(validators, key) || validate === undefined) {
      throw new Error(`Unsupported focused Vitest option: ${key}. Use -t, --project, --isolate, --pool, or --maxWorkers.`);
    }
    const value: unknown = Reflect.get(options, key);
    if (!validate(value)) throw new Error(`Malformed focused Vitest option: ${key}. Supply its native value.`);
  }
}
