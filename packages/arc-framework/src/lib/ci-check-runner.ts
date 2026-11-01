/** Execute declared invocation batches placed on one repository CI step. */
import type { CheckDeclaration } from "./checks/declaration.js";
import type { CheckForecast } from "./checks/forecast.js";
import type { CheckPlumbing } from "./ci-check-plumbing.js";
import { resolve } from "node:path";
import { runCheckProcess } from "./checks/process.js";
import { type CheckIndexView, createCheckIndexView } from "./checks/index-view.js";
import { gitExec } from "./io-context.js";
import { createWorktreeSnapshot } from "./checks/tree.js";
import { z } from "zod";
import { CHECK_REQUEST_SCHEMA_VERSION } from "./checks/usage.js";
import { EnvironmentInputsSchema } from "./checks/environment-declaration.js";
import { bindCapturedEnvironment, captureEnvironmentInputs, type CapturedBinding } from "./checks/environment-inputs.js";

const REGENERATE_FORECAST = "regenerate the forecast with arc check gate merge --ci --dry-run --json and retry the CI step.";

const batches = z.array(z.array(z.string()).min(1));
const CiForecastEnvelopeSchema = z.object({
  schemaVersion: z.literal(CHECK_REQUEST_SCHEMA_VERSION),
  result: z.object({ ci: z.literal(true), status: z.literal("completed"), tree: z.string(),
    base: z.string().optional(), merged: z.array(z.string()).optional(),
    checks: z.array(z.object({ id: z.string(), cwd: z.string(), mode: z.enum(["files", "project"]),
      shell: z.boolean(), fixes: z.boolean(), ciOnly: z.boolean(), environmentInputs: EnvironmentInputsSchema, batches,
      shards: z.array(z.object({ index: z.int().positive(), batches })).optional(),
    })),
  }),
});

/**
 * Read the invocation-bearing fields of a successful CI merge forecast.
 * @param envelope - JSON emitted by the declared-check command
 * @returns Validated coordinates and native batches
 */
export function parseCiCheckForecast(envelope: unknown): CiCheckForecast {
  const parsed = CiForecastEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map(issue => issue.path.map(String).join(".") || "<root>"))].join(", ");
    throw new Error(`Invalid CI check forecast at ${fields}; ${REGENERATE_FORECAST}`, { cause: parsed.error });
  }
  return parsed.data.result;
}

/** The invocation-bearing portion of a successful merge forecast. */
export interface CiCheckForecast {
  base?: string;
  tree: string;
  merged?: string[];
  checks: Array<CheckForecast & { id: string }>;
}

/** One step's native execution coordinates and workflow-owned arguments. */
export interface CiCheckStep {
  root: string;
  forecast: CiCheckForecast;
  plumbing: CheckPlumbing;
  declaration: CheckDeclaration;
  job: string;
  step: string;
  shard?: number;
  arguments?: string[];
}

/**
 * Run this step's mapped entries, or all unmapped entries at the default step.
 * @param options - Repository root, forecast, declaration and step coordinates
 * @returns Nonzero when an invocation fails or a verifier rewrites content
 */
export async function runCiCheckStep(options: CiCheckStep): Promise<number> {
  let exitCode = 0;
  for (const check of options.forecast.checks) {
    const destinations = options.plumbing[check.id];
    const selected = (options.step === "default" && destinations === undefined)
      || destinations?.some(destination => destination.job === options.job && destination.step === options.step);
    if (!selected) continue;
    validateEnvironmentDeclaration(options.declaration, check);
    const shard = options.shard;
    if (shard !== undefined && check.shards === undefined) {
      throw new Error(`CI check ${check.id} has no shards; remove --shard from this step, or declare shards and ${REGENERATE_FORECAST}`);
    }
    const batches = shard === undefined || check.shards === undefined ? check.batches
      : check.shards.find(entry => entry.index === shard)?.batches;
    if (batches === undefined) throw new Error(`Missing shard for ${check.id}: ${shard}`);
    if (await runForecastCheck(options, check, batches) !== 0) exitCode = 1;
  }
  return exitCode;
}

function validateEnvironmentDeclaration(declaration: CheckDeclaration, check: CheckForecast & { id: string }): void {
  const current = Object.hasOwn(declaration.checks, check.id) ? declaration.checks[check.id] : undefined;
  const inputs = current?.environment_inputs;
  if (inputs === undefined || Object.keys(inputs).length !== Object.keys(check.environmentInputs).length
    || Object.entries(check.environmentInputs).some(([name, kind]) => !Object.hasOwn(inputs, name) || inputs[name] !== kind)) {
    throw new Error(`CI check ${check.id} has a missing or changed environment declaration; ${REGENERATE_FORECAST}`);
  }
}

async function runForecastCheck(options: CiCheckStep, check: CheckForecast & { id: string }, batches: string[][]): Promise<number> {
  if (batches.length === 0) return 0;
  if (Object.keys(check.environmentInputs).length === 0) return runNativeForecastCheck(options, check, batches);
  const capture = await captureEnvironmentInputs(check.environmentInputs, resolve(options.root, check.cwd));
  const executed = await runNativeForecastCheck(options, check, batches, capture.bindings).then(
    result => ({ ok: true as const, result }), (error: unknown) => ({ ok: false as const, error }));
  const cleanup = await capture.dispose().then(() => undefined, (error: unknown) => error instanceof Error ? error.message : String(error));
  if (!executed.ok) throw executed.error;
  if (cleanup !== undefined) process.stderr.write(`${check.id}: ${cleanup}\n`);
  return executed.result;
}

async function runNativeForecastCheck(options: CiCheckStep, check: CheckForecast & { id: string }, batches: string[][],
  bindings?: Readonly<Record<string, CapturedBinding>>): Promise<number> {
  let exitCode = 0;
  let index: CheckIndexView | undefined;
  const before = check.fixes ? await createWorktreeSnapshot(gitExec, options.root) : undefined;
  try {
    if (options.declaration.checks[check.id]?.reads_index) {
      index = await createCheckIndexView(gitExec, options.root, options.forecast.tree);
    }
    for (const batch of batches) {
      // The command's output streams to the step's log as it is written, so a stalled run shows where it stopped.
      process.stdout.write(`${check.id}:\n`);
      const result = await runCheckProcess([...batch, ...options.arguments ?? []], resolve(options.root, check.cwd),
        check.mode === "files" ? options.forecast : undefined, { shell: check.shell, indexFile: index?.file,
          forward: (chunk, stream) => { (stream === "stdout" ? process.stdout : process.stderr).write(chunk); },
          ...(bindings === undefined ? {} : { environment: bindCapturedEnvironment(bindings, process.env) }) });
      if (!result.started && result.output) process.stdout.write(`${check.id}: ${result.output}\n`);
      if (!result.started || result.exitCode !== 0) exitCode = 1;
    }
    if (before !== undefined) {
      const original = before.tree;
      if (await before.refresh() !== original) {
        process.stderr.write(`${check.id}: rewrote files during verification\n`);
        exitCode = 1;
      }
    }
  } finally { await Promise.all([before?.remove(), index?.remove()]); }
  return exitCode;
}
