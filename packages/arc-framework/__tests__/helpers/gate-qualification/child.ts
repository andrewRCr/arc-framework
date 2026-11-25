/** One complete production gate per process, with qualification-only observation. */
import { availableParallelism } from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import { renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { atomicCreateFile, atomicWriteFile } from "../../../src/lib/fs.js";
import { createExecaGitExec, createExecaGitExecInput, createExecaRawGitExec } from "../../../src/lib/git/process-executor.js";
import { readTypedProjectFile } from "../../../src/lib/config/typed-file-reader.js";
import { CheckDeclarationSchema } from "../../../src/lib/checks/declaration.js";
import { checkRecordDirectory, createCheckPassStore } from "../../../src/lib/checks/record.js";
import { createCheckReportStore } from "../../../src/lib/checks/reports.js";
import { selectRequestChecks } from "../../../src/lib/checks/gates.js";
import { runCheckProcess } from "../../../src/lib/checks/process.js";
import { readMachineCheckRunner } from "../../../src/lib/checks/runner/machine-config.js";
import { createCheckRunnerRequestControl } from "../../../src/lib/checks/runner/request-control.js";
import type { CheckExecutionAttempt, CheckExecutionPreparation } from "../../../src/lib/checks/runner/execution.js";
import { runDeclaredRequest, type DeclaredCheckDependencies } from "../../../src/handlers/check/run.js";
import { readNativeShardObservations } from "../native-shard-evidence.js";
import { identity, instrumentDeclaration, type CapturedGateCheck, type GateTrial, type GateTrialReport } from "./model.js";

async function query(argv: readonly [string, ...string[]]): Promise<unknown> {
  const result = await execa(argv[0], argv.slice(1), { reject: false, timeout: 15_000 });
  if (result.exitCode !== 0) throw new Error(result.stderr || `Provider query exited ${result.exitCode}`);
  return JSON.parse(result.stdout);
}
function bindingIdentities(bindings: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(bindings).map(([name, value]) => [name,
    value !== null && typeof value === "object" && "kind" in value && value.kind === "file" ? value : { identity: identity(value) }]));
}
/** Exercise the selected-check handler with the same real I/O boundaries as the CLI. */
export async function runGateTrial(trial: GateTrial): Promise<GateTrialReport> {
  const startedAt = Date.now(), started = performance.now();
  const report: GateTrialReport = { version: 1, id: trial.id, arm: trial.arm, pairId: trial.pairId, batchId: trial.batchId,
    gate: trial.gate, controllerPid: process.pid, startedAt, finishedAt: startedAt, controllerMs: 0,
    expectedChecks: [], nativeChecks: [...trial.nativeChecks], attempts: [], captures: [], native: {}, contextNative: {}, coverageErrors: [], nativeProcesses: [], telemetry: {}, retained: [], errors: [], completed: false };
  const root = resolve(trial.checkout), git = createExecaGitExec(), control = createCheckRunnerRequestControl();
  const tracked = new Map<CheckExecutionAttempt, { file: string; argv: readonly string[] }>();
  const active = new Set<CheckExecutionAttempt>();
  let captureListening = false, interruptionCaptured = false;
  const detachCapture = () => {
    process.off("SIGTERM", captureSignal); process.off("SIGINT", captureSignal); captureListening = false;
  };
  const checkpoint = (cause: string) => {
    try {
      const attempts = [...tracked].map(([attempt, configuration]) => ({
        ...report.attempts.find(value => value.planId === attempt.planId), configuration, retained: attempt.retained,
      }));
      const captures = report.captures.map(({ planId, source, environmentBindings, closure }) => ({ planId, source, environmentBindings, closure }));
      const target = join(trial.outputDirectory, "retained.json"), temporary = `${target}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify({ version: 1, trialId: trial.id, observedAt: Date.now(), cause, attempts, captures }, null, 2));
      renameSync(temporary, target);
    } catch (cause) { report.telemetry.error = `Capture checkpoint unavailable: ${String(cause)}`; }
  };
  const captureSignal = (signal: NodeJS.Signals) => {
    checkpoint(signal); interruptionCaptured = true;
    // Remain observational: RequestControl's later escalation must regain default signal behavior.
    detachCapture();
  };
  const finishAttempt = (attempt: CheckExecutionAttempt) => {
    active.delete(attempt);
    if (active.size === 0) detachCapture();
  };
  const source = async () => ({ head: (await git("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim(),
    tree: (await git("git", ["rev-parse", "HEAD^{tree}"], { cwd: root })).stdout.trim(),
    status: (await git("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root })).stdout });
  const assertSource = (value: Awaited<ReturnType<typeof source>>) => {
    if (value.head !== trial.expected.head || value.tree !== trial.expected.tree || value.status.trim() !== "") {
      throw new Error("Gate checkout differs from its fixed clean source; preserve this unsuccessful sample.");
    }
  };
  try {
    if (Object.keys(trial.environment).some(name => /^(?:ARC_OFFLOAD_|ARC_REMOTE_CHECKS|HOME$|XDG_CONFIG_HOME$|XDG_STATE_HOME$)/u.test(name))) {
      throw new Error("Trial environment must not override provider routing, mode or live configuration.");
    }
    report.sourceBefore = await source(); assertSource(report.sourceBefore);
    if (trial.provider !== undefined) try {
      report.telemetry.status = await query(trial.provider.status);
      const status = report.telemetry.status as { mode?: unknown };
      if (typeof status.mode === "string" && ["speed", "spill", "on", "required", "off"].includes(status.mode)) report.ownerMode = status.mode;
    } catch (cause) { report.telemetry.error = String(cause); }
    if (trial.arm === "native-local" && (report.ownerMode === undefined || report.ownerMode === "required")) {
      throw new Error("Native context needs observed owner policy permitting local execution; no mode override is performed.");
    }
    const io: DeclaredCheckDependencies = { platform: process.platform, availableParallelism,
      git, gitInput: createExecaGitExecInput(), rawGit: createExecaRawGitExec(root), interrupted: () => control.interrupted,
      passes: createCheckPassStore({ directory: () => checkRecordDirectory(git, root),
        readFile: file => readFile(file, "utf8"), createFile: atomicCreateFile }),
      reports: createCheckReportStore({ directory: () => checkRecordDirectory(git, root),
        readFile: file => readFile(file, "utf8"), writeFile: atomicWriteFile }),
      readDeclaration: async directory => {
        const loaded = await readTypedProjectFile(directory, "check-declaration", CheckDeclarationSchema);
        if (loaded.status !== "valid") return loaded;
        const text = await readFile(resolve(directory, loaded.location), "utf8");
        const instrumented = instrumentDeclaration(loaded.value, trial);
        report.declaration = { location: loaded.location, digest: identity(text), original: loaded.value, instrumented };
        report.expectedChecks = selectRequestChecks(instrumented.checks, { kind: "gate", gate: trial.gate }).map(([id]) => id);
        report.comparisonIdentity = identity({ expected: trial.expected, gate: trial.gate, scope: trial.scope,
          baseBranch: trial.baseBranch, ci: trial.ci ?? false, environment: trial.environment, declaration: loaded.value,
          nativeChecks: trial.nativeChecks, observerConfig: trial.observerConfig, requiredPassedChecks: trial.requiredPassedChecks });
        return { ...loaded, value: instrumented };
      },
      readRunnerConfiguration: trial.arm === "native-local" ? async () => undefined
        : check => check.runner && trial.runnerConfiguration !== undefined ? Promise.resolve(trial.runnerConfiguration) : readMachineCheckRunner(check),
      prepareExecution: (input, executionIO) => {
        const outputs: CapturedGateCheck["outputs"] = [], diagnostics: string[] = [];
        const attempt = control.prepare({ ...input,
          onOutput: frame => { outputs.push({ invocationId: frame.invocationId, stream: frame.stream,
            dataBase64: Buffer.from(frame.bytes).toString("base64") }); return input.onOutput?.(frame); },
          onDiagnostic: bytes => { diagnostics.push(Buffer.from(bytes).toString("base64")); return input.onDiagnostic?.(bytes); },
        }, executionIO);
        const preparationStart = performance.now();
        const attemptRecord: GateTrialReport["attempts"][number] = { planId: attempt.planId, startedAt: Date.now() };
        report.attempts.push(attemptRecord);
        tracked.set(attempt, { file: input.configuration.file, argv: [...input.configuration.argv] });
        active.add(attempt);
        // control.prepare installed its own cancellation handlers before these capture-only observers.
        if (!captureListening && !interruptionCaptured) {
          process.on("SIGTERM", captureSignal); process.on("SIGINT", captureSignal); captureListening = true;
        }
        checkpoint("attempt");
        const observed = attempt.then(async (prepared): Promise<CheckExecutionPreparation> => {
          attemptRecord.preparationMs = performance.now() - preparationStart;
          attemptRecord.status = prepared.status;
          if (prepared.status !== "ready") { attemptRecord.failure = prepared; checkpoint("preparation-finished"); finishAttempt(attempt); return prepared; }
          const execution = prepared.execution, binding = execution.environment.ARC_TEST_DURATION_FILE;
          const capture: CapturedGateCheck = { planId: execution.planId,
            logicalRequest: { scope: input.request.scope, tree: input.request.tree, base: input.request.base,
              merged: input.request.merged, merges: input.request.merges, remoteBase: input.request.remoteBase,
              mergePaths: input.request.mergePaths, mergePathsUnresolved: input.request.mergePathsUnresolved }, source: structuredClone(execution.source),
            environmentIdentity: execution.environmentIdentity, environmentBindings: bindingIdentities(execution.environment),
            duration: binding?.kind !== "file" ? undefined : binding.state === "file"
              ? { kind: "file", state: "file", digest: binding.digest, bytes: binding.bytes } : { kind: "file", state: binding.state },
            plan: structuredClone(execution.plan), runtime: execution.runtime === undefined ? null : [...execution.runtime].map(([invocationId, binding]) =>
              ({ invocationId, identity: binding.identity, probes: [...binding.probes] })),
            supportsRunGroup: execution.supportsRunGroup, outputs, diagnostics, outcomes: [] };
          report.captures.push(capture);
          checkpoint("ready");
          return { ...prepared, execution: Object.freeze({ ...execution, get observedOutcomes() { return execution.observedOutcomes; },
            close: async () => {
              try { capture.closure = await execution.close(); capture.outcomes = [...execution.observedOutcomes]; return capture.closure; }
              finally { checkpoint("execution-close"); finishAttempt(attempt); }
            } }) };
        }, (cause: unknown) => {
          attemptRecord.status = "threw"; attemptRecord.failure = String(cause);
          checkpoint("preparation-failed"); finishAttempt(attempt); throw cause;
        });
        return Object.defineProperties(observed, { planId: { value: attempt.planId }, retained: { get: () => attempt.retained },
          cancel: { value: () => attempt.cancel() }, terminate: { value: () => { attempt.terminate(); } } }) as CheckExecutionAttempt;
      },
      execute: async (argv, cwd, content, policy) => {
        const began = performance.now(), result = await runCheckProcess(argv, cwd, content, policy);
        report.nativeProcesses.push({ argv: [...argv], cwd, indexFile: policy?.indexFile, ...result, costMs: performance.now() - began });
        return result;
      },
      runtime: (command, cwd, environment) => runCheckProcess(command, cwd, undefined, { rawStdout: true, environment }),
    };
    report.outcome = await runDeclaredRequest(root, io, { form: { kind: "gate", gate: trial.gate },
      scope: trial.scope, baseBranch: trial.baseBranch, ci: trial.ci, force: true });
    if (report.outcome.kind === "result") {
      const checks = report.outcome.result.checks;
      if (identity(checks.map(check => check.id)) !== identity(report.expectedChecks)) report.errors.push("Complete requested check accounting differs.");
      if (report.outcome.result.tree?.trim() !== trial.expected.tree || report.outcome.result.base?.trim() !== trial.expected.base) {
        report.errors.push("Resolved gate source/base differs from the fixed comparison request.");
      }
      if (checks.some(check => ["reused", "would run", "skipped"].includes(check.outcome))) report.errors.push("Gate did not perform forced fresh work.");
      for (const id of trial.requiredPassedChecks) if (checks.find(check => check.id === id)?.outcome !== "passed") report.errors.push(`Required useful work was not completed: ${id}`);
      for (const capture of report.captures) capture.checkId = checks.find(check => check.invocations?.some(detail =>
        capture.plan.invocations.some(invocation => invocation.id === detail.invocationId)))?.id;
      for (const id of trial.nativeChecks) {
        const capture = report.captures.find(value => value.checkId === id);
        if (capture === undefined) {
          try { report.contextNative[id] = readNativeShardObservations(checks.find(check => check.id === id)?.output ?? ""); }
          catch (cause) { report.coverageErrors.push(`Native context ${id}: ${String(cause)}`); }
          continue;
        }
        const check = report.declaration!.instrumented.checks[id]!;
        if (capture.duration === undefined) { report.errors.push(`Native duration binding missing: ${id}`); continue; }
        try { report.native[id] = capture.plan.invocations.map(invocation => {
          const outcome = capture.outcomes.find(([name]) => name === invocation.id)?.[1] as { status?: string; exitCode?: number } | undefined;
          const stdout = Buffer.concat(capture.outputs.filter(output => output.invocationId === invocation.id && output.stream === "stdout")
            .map(output => Buffer.from(output.dataBase64, "base64"))).toString("utf8");
          return { exitCode: outcome?.status === "completed" ? outcome.exitCode ?? -1 : -1,
            basis: { sourceDigest: capture.source.digest, environmentIdentity: capture.environmentIdentity,
              selection: typeof check.command === "string" ? [check.command] : check.command, duration: capture.duration! },
            observations: readNativeShardObservations(stdout) };
        }); } catch (cause) { report.coverageErrors.push(`Native ${id}: ${String(cause)}`); }
      }
    }
  } catch (cause) { report.errors.push(String(cause)); }
  finally {
    report.retained = [...await control.finish(report.outcome === undefined || report.outcome.kind === "error")];
    try { report.sourceAfter = await source(); assertSource(report.sourceAfter); } catch (cause) { report.errors.push(String(cause)); }
    if (report.declaration !== undefined) try {
      if (identity(await readFile(resolve(root, report.declaration.location), "utf8")) !== report.declaration.digest) report.errors.push("Actual on-disk declaration changed during the gate.");
    } catch (cause) { report.errors.push(String(cause)); }
    if (trial.provider !== undefined) try {
      const records = await query(trial.provider.history), plans = new Set(report.attempts.map(attempt => attempt.planId));
      report.telemetry.records = Array.isArray(records) ? records.filter(record => plans.has(record?.context?.plan_id)) : records;
      report.telemetry.missingPlanIds = Array.isArray(records) ? [...plans].filter(plan => !records.some(record => record?.context?.plan_id === plan)) : [...plans];
    } catch (cause) { report.telemetry.error = [report.telemetry.error, String(cause)].filter(Boolean).join("; "); }
    report.completed = report.outcome?.kind === "result" && report.outcome.exitCode === 0 && report.errors.length === 0
      && report.retained.length === 0 && report.captures.every(capture => capture.closure?.status === "closed");
    report.finishedAt = Date.now(); report.controllerMs = performance.now() - started;
    detachCapture();
  }
  return report;
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [requestFile, outputFile] = process.argv.slice(2);
  if (requestFile === undefined || outputFile === undefined) throw new Error("Use REQUEST_JSON OUTPUT_JSON.");
  const report = await runGateTrial(JSON.parse(await readFile(requestFile, "utf8")) as GateTrial);
  await writeFile(outputFile, JSON.stringify(report, null, 2));
  process.exitCode = report.completed ? 0 : report.outcome?.exitCode || 2;
}
