/** Qualification artifacts, never check or reuse authority. */
import { createHash } from "node:crypto";
import type { CheckDeclaration } from "../../../src/lib/checks/declaration.js";
import type { CheckRequest } from "../../../src/lib/checks/request.js";
import type { RunDeclaredChecksResult } from "../../../src/handlers/check/run.js";
import type { CheckExecutionClosure, PreparedCheckExecution } from "../../../src/lib/checks/runner/execution.js";
import type { MachineCheckRunnerConfiguration } from "../../../src/lib/checks/runner/machine-config.js";
import type { NativeDurationInput, NativeShardObservation } from "../native-shard-evidence.js";
import type { NativeMembershipRun } from "../native-shard-qualification.js";

export type GateArm = "routed-unsharded" | "distributed" | "native-local";
export interface GateTrial {
  id: string; pairId: string; batchId: string; arm: GateArm;
  checkout: string; expected: { head: string; tree: string; base?: string };
  gate: "merge" | "push"; scope: NonNullable<CheckRequest["scope"]>; baseBranch?: string; ci?: boolean;
  environment: Record<string, string | null>;
  nativeChecks: readonly string[]; requiredPassedChecks: readonly string[]; observerConfig: string;
  runnerConfiguration?: MachineCheckRunnerConfiguration;
  provider?: { status: readonly [string, ...string[]]; history: readonly [string, ...string[]] };
  outputDirectory: string; timeoutMs: number;
}
export interface CapturedGateCheck {
  checkId?: string; planId: string; logicalRequest: unknown; source: PreparedCheckExecution["source"];
  environmentIdentity: string; environmentBindings: Record<string, unknown>; duration?: NativeDurationInput;
  plan: PreparedCheckExecution["plan"]; runtime: { invocationId: string; identity: string; probes: [string, string][] }[] | null; supportsRunGroup: boolean;
  outputs: { invocationId: string; stream: "stdout" | "stderr"; dataBase64: string }[];
  diagnostics: string[]; outcomes: [string, unknown][]; closure?: CheckExecutionClosure;
}
export interface GateTrialReport {
  version: 1; id: string; arm: GateArm; pairId: string; batchId: string; gate: GateTrial["gate"];
  controllerPid: number; startedAt: number; finishedAt: number; controllerMs: number; comparisonIdentity?: string;
  declaration?: { location: string; digest: string; original: CheckDeclaration; instrumented: CheckDeclaration };
  expectedChecks: string[]; nativeChecks: string[];
  attempts: { planId: string; startedAt: number; preparationMs?: number; status?: string; failure?: unknown }[]; sourceBefore?: { head: string; tree: string; status: string };
  sourceAfter?: { head: string; tree: string; status: string }; outcome?: RunDeclaredChecksResult;
  captures: CapturedGateCheck[]; native: Record<string, NativeMembershipRun[]>; ownerMode?: string;
  telemetry: { status?: unknown; records?: unknown; missingPlanIds?: string[]; error?: string }; retained: unknown[]; errors: string[]; completed: boolean;
  coverageErrors: string[]; contextNative: Record<string, NativeShardObservation[]>;
  nativeProcesses: { argv: readonly string[]; cwd: string; indexFile?: string; started: boolean; exitCode: number; output: string; stdout: string; costMs: number }[];
}
export interface GateSample {
  request: Pick<GateTrial, "id" | "pairId" | "batchId" | "arm" | "gate">;
  startedAt: number; finishedAt: number; collectionMs: number;
  processExit: { exitCode?: number; signal?: string; timedOut: boolean };
  stdout: string; stderr: string; report?: GateTrialReport; rejectedReport?: unknown; failure?: string;
}
/** Hash logical comparison inputs without depending on object property insertion order. */
export function identity(value: unknown): string {
  const canonical = (input: unknown): unknown => Array.isArray(input) ? input.map(canonical)
    : input !== null && typeof input === "object"
      ? Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : input;
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}
/** Preserve the complete actual declaration; instrumentation is identical between arms. */
export function instrumentDeclaration(actual: CheckDeclaration, trial: GateTrial): CheckDeclaration {
  const value = structuredClone(actual);
  for (const id of trial.nativeChecks) {
    const check = value.checks[id];
    if (check === undefined || typeof check.command === "string") throw new Error(`Native observer needs declared argv: ${id}`);
    check.command = [...check.command, "--config", trial.observerConfig];
    check.environment_inputs = { ...check.environment_inputs, ARC_TEST_DURATION_FILE: "file" };
  }
  if (trial.arm === "routed-unsharded") for (const check of Object.values(value.checks)) {
    if (check.runner && check.shards !== undefined) check.shards.routed = false;
  }
  return value;
}
