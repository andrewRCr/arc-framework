/** Non-gating real-adapter cost measurement. Run with node --import tsx; no Vitest runtime. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { availableParallelism, arch, release, tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { runDeclaredRequest, type DeclaredCheckDependencies } from "../../src/handlers/check/run.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { runCheckProcess } from "../../src/lib/checks/process.js";
import { createCheckPassStore, checkRecordDirectory } from "../../src/lib/checks/record.js";
import { createCheckReportStore } from "../../src/lib/checks/reports.js";
import { readTypedProjectFile } from "../../src/lib/config/typed-file-reader.js";
import { atomicCreateFile, atomicWriteFile } from "../../src/lib/fs.js";
import { createExecaGitExec, createExecaGitExecInput, createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { prepareSelectedCheckExecution, type CheckExecutionAttempt, type PreparedCheckExecution,
  type RetainedCheckExecution } from "../../src/lib/checks/runner/execution.js";
import { startCheckRunnerProcess } from "../../src/lib/checks/runner/session-process.js";
import { readMachineCheckRunner } from "../../src/lib/checks/runner/machine-config.js";
import { nodeSourcePresentationIO } from "../../src/lib/checks/runner/source-io.js";
import { removeGitBackedDir } from "../helpers/temp-repo.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const options = parseArgs({ options: { runner: { type: "string" }, origin: { type: "string" },
  samples: { type: "string", default: "3" }, output: { type: "string" } } }).values;
const samples = Number(options.samples);
assert(Number.isSafeInteger(samples) && samples > 0, "--samples must be a positive integer");
assert(options.output !== undefined && options.output.length > 0, "--output is required");
const output = resolve(options.output);
const outputRelative = relative(repositoryRoot, output);
assert(outputRelative !== ".." && !outputRelative.startsWith(`..${sep}`) && outputRelative !== "", "--output must be under the repository");
const defaultRunner = [process.execPath, resolve(import.meta.dirname, "../../examples/check-runner/local.mjs"), "--known-node-runtime"];
const parsedRunner: unknown = options.runner === undefined ? defaultRunner : JSON.parse(options.runner);
assert(Array.isArray(parsedRunner) && parsedRunner.length > 0 && parsedRunner.every((part: unknown) => typeof part === "string" && !part.includes("\0"))
  && parsedRunner[0] !== "", "--runner must be literal nonempty JSON argv");
const runner = parsedRunner as [string, ...string[]];
const git = createExecaGitExec();
const sourceRevision = (await git("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot })).stdout;
const executable = options.origin === undefined ? process.execPath : "node";
const workload = `const {createHash}=require('node:crypto');const fs=require('node:fs');
const started=performance.now();let value=fs.readFileSync('input.txt');
for(let i=0;i<10000;i++)value=createHash('sha256').update(value).digest();
if(fs.readFileSync(process.env.CHECK_BENCH_FILE).length!==64||process.env.CHECK_BENCH_SCALAR!=='fixed scalar')process.exit(7);
const receiptPath=require('node:path').join(process.env.CHECK_BENCH_DIR,'events.jsonl');
const receipts=fs.existsSync(receiptPath)?fs.readFileSync(receiptPath,'utf8').trim().split('\\n').filter(Boolean).map(JSON.parse):[];
fs.rmSync(process.env.CHECK_BENCH_DIR,{recursive:true,force:true});
process.stdout.write(JSON.stringify({digest:value.toString('hex'),bodyMs:performance.now()-started,receipts}));\n`;
const probe = `const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');
fs.mkdirSync(process.env.CHECK_BENCH_DIR,{recursive:true});const started=performance.now();
const version=execFileSync(process.execPath,['-p','process.version']);
fs.appendFileSync(path.join(process.env.CHECK_BENCH_DIR,'events.jsonl'),JSON.stringify({phase:'probe',elapsedMs:performance.now()-started})+'\\n');
process.stdout.write(version);`;
const fixtureFiles = { "package.json": JSON.stringify({ name: "arc-runner-cost-fixture", version: "1.0.0", private: true }),
  "package-lock.json": JSON.stringify({ name: "arc-runner-cost-fixture", version: "1.0.0", lockfileVersion: 3, requires: true,
    packages: { "": { name: "arc-runner-cost-fixture", version: "1.0.0" } } }), ".gitignore": "*.secret\n", "input.txt": "fixed benchmark source\r\n", "workload.cjs": workload,
  ".arc/system/arc-checks.yml": JSON.stringify({ checks: { benchmark: { command: [executable, "workload.cjs"],
    runner: true, mode: "project", inputs: ["input.txt", "workload.cjs"], environment_inputs: { CHECK_BENCH_FILE: "file", CHECK_BENCH_SCALAR: "value", CHECK_BENCH_DIR: "value" },
    runtime_inputs: [[executable, "-e", probe]] } } }) };
interface Measurement {
  sample: number; turn: string; totalMs: number; captureAndPreverifyMs?: number; preparationAndPostverifyMs?: number;
  runMs: number; closeMs: number; runtime: "known" | "unknown" | "unavailable"; adapterSpawns: number;
  invocationRequests: number; passLookups: number; passWrites: number; outcome?: string; diagnosticTimings: unknown[]; retained: RetainedCheckExecution[];
}
const measurements: Measurement[] = [];
let retainedFixture: string | undefined;
let receiptDirectory: string;
const report = () => ({ version: 1, command: process.argv, runner, origin: options.origin ?? null, samples,
  sourceRevision,
  environment: { node: process.version, platform: process.platform, arch: arch(), release: release(), cores: availableParallelism() },
  coldDefinition: "Fresh committed fixture and context; OS, Git, executable and provider/pool caches are not cleared.",
  phases: { captureAndPreverifyMs: "Caller facade entry to adapter launch; includes capture, plan, Git metadata and preverification.",
    preparationAndPostverifyMs: "Launch to facade ready; includes process start, adapter preparation/probes and caller postverification.",
    runMs: "Sum of public execution.run latency, including invocation validation, transport, required output and settlement.",
    closeMs: "First public close latency only, including release, stream/process closure and caller input cleanup.",
    totalMs: "Complete production runDeclaredRequest latency, including selection, key/store/report operations.",
    precision: "Capture and preparation are aggregates. Diagnostic receipts time inner probe child and optional provider preparation bodies, excluding outer supervisor/transport. Requalification can repeat probes during run. Receipt absence is N/A, never zero. A remote cache hit leaves remote receipts unavailable to this caller unless collected by the provider.",
    diagnosticReceipts: "CHECK_BENCH_DIR is a fixed explicit path per fixture outside source; events.jsonl contains {phase,elapsedMs}. Live commands return and remove receipts; reused output is never read for timings." },
  fixture: { files: Object.entries(fixtureFiles).map(([path, content]) => ({ path, bytes: Buffer.byteLength(content),
    sha256: createHash("sha256").update(content).digest("hex") })), explicitFileBytes: 64, scalar: "fixed scalar",
    dependencyPreparation: "Not performed by the standalone example; external providers own preparation independently.",
    workloadIterations: 10000, workload: "Node builtin SHA-256 loop; bodyMs is output only and never a probe/key input." },
  measurements, ...(retainedFixture === undefined ? {} : { retainedFixture }) });
async function save(): Promise<void> { await writeFile(output, `${JSON.stringify(report(), null, 2)}\n`); }

function timedPreparation(row: Measurement): typeof prepareSelectedCheckExecution {
  return (input, supplied) => {
    const started = performance.now();
    let launched: number | undefined;
    const attempt = prepareSelectedCheckExecution({ ...input, environment: { ...process.env,
      CHECK_BENCH_FILE: join(input.callerRoot, "input.secret"), CHECK_BENCH_SCALAR: "fixed scalar", CHECK_BENCH_DIR: receiptDirectory } }, {
      ...(supplied ?? { git, gitRaw: createExecaRawGitExec(), source: nodeSourcePresentationIO }), launch: processInput => {
        launched = performance.now(); row.adapterSpawns++; row.captureAndPreverifyMs = launched - started;
        return startCheckRunnerProcess(processInput);
      } });
    const wrapped = attempt.then(result => {
      if (result.status !== "ready") {
        row.runtime = "unavailable";
        if (result.status === "uncertain") row.retained.push(result.retained);
        return result;
      }
      row.preparationAndPostverifyMs = performance.now() - (launched ?? started);
      const execution = result.execution;
      row.runtime = execution.runtime === undefined ? "unknown" : "known";
      let closing: ReturnType<PreparedCheckExecution["close"]> | undefined;
      const observed: PreparedCheckExecution = { ...execution, get observedOutcomes() { return execution.observedOutcomes; },
        run: async id => {
          row.invocationRequests++;
          const begin = performance.now();
          try { return await execution.run(id); } finally { row.runMs += performance.now() - begin; }
        }, close: () => {
          closing ??= (async () => {
            const begin = performance.now();
            try {
              const closure = await execution.close();
              if (closure.status === "uncertain") row.retained.push(closure.retained);
              return closure;
            } finally { row.closeMs += performance.now() - begin; }
          })();
          return closing;
        } };
      return { status: "ready" as const, execution: observed };
    });
    return Object.defineProperties(wrapped, { planId: { value: attempt.planId }, retained: { get: () => attempt.retained },
      cancel: { value: () => attempt.cancel() }, terminate: { value: () => { attempt.terminate(); } } }) as CheckExecutionAttempt;
  };
}

await mkdir(dirname(output), { recursive: true });
try {
  for (let sample = 0; sample < samples; sample++) {
    const root = await mkdtemp(join(dirname(output), "mcr-cost-fixture-"));
    retainedFixture = root;
    receiptDirectory = await mkdtemp(join(tmpdir(), "mcr-cost-receipts-"));
    await git("git", ["init", "-q", "-b", "main"], { cwd: root });
    await mkdir(join(root, ".arc/system"), { recursive: true });
    for (const [path, content] of Object.entries(fixtureFiles)) await writeFile(join(root, path), content);
    await writeFile(join(root, "input.secret"), Buffer.alloc(64, 0x5a));
    await git("git", ["add", "-A"], { cwd: root });
    await git("git", ["-c", `core.hooksPath=${join(root, "disabled-hooks.secret")}`, "-c", "user.name=ARC Benchmark", "-c", "user.email=benchmark@example.invalid", "commit", "-qm", "benchmark fixture"], { cwd: root });
    if (options.origin !== undefined) await git("git", ["remote", "add", "origin", options.origin], { cwd: root });
    const machineHome = join(root, "machine.secret");
    await mkdir(join(machineHome, ".arc"), { recursive: true });
    await writeFile(join(machineHome, ".arc/config.yml"), JSON.stringify({ "checks.runner": runner }));
    const passes = createCheckPassStore({ directory: () => checkRecordDirectory(git, root), readFile: path => readFile(path, "utf8"), createFile: atomicCreateFile });
    for (const turn of ["cold", "warm", "hit-candidate"]) {
      const row: Measurement = { sample, turn, totalMs: 0, runMs: 0, closeMs: 0, runtime: "unavailable", adapterSpawns: 0,
        invocationRequests: 0, passLookups: 0, passWrites: 0, diagnosticTimings: [], retained: [] };
      measurements.push(row);
      const io: DeclaredCheckDependencies = { git, gitInput: createExecaGitExecInput(), rawGit: createExecaRawGitExec(root),
        platform: process.platform, availableParallelism, readRunnerConfiguration: check => readMachineCheckRunner(check, { home: () => machineHome }),
        prepareExecution: timedPreparation(row), readDeclaration: directory => readTypedProjectFile(directory, "check-declaration", CheckDeclarationSchema),
        passes: { get: async (...args) => { row.passLookups++; return passes.get(...args); },
          put: async record => { row.passWrites++; return passes.put(record); } },
        reports: createCheckReportStore({ directory: () => checkRecordDirectory(git, root), readFile: path => readFile(path, "utf8"), writeFile: atomicWriteFile }),
        execute: runCheckProcess, runtime: (command, cwd, environment) => runCheckProcess(command, cwd, undefined, { rawStdout: true, environment }) };
      const started = performance.now();
      const result = await runDeclaredRequest(root, io, { form: { kind: "run", ids: ["benchmark"] }, force: turn !== "hit-candidate" });
      row.totalMs = performance.now() - started;
      row.outcome = result.kind === "result" ? result.result.checks[0]?.outcome : "error";
      if (result.kind === "result" && row.outcome !== "reused") {
        try {
          const payload: unknown = JSON.parse(result.result.checks[0]?.output ?? "");
          if (typeof payload === "object" && payload !== null && "receipts" in payload && Array.isArray(payload.receipts)) row.diagnosticTimings = payload.receipts;
        } catch { /* Diagnostics never establish the command verdict. */ }
      } else if (row.outcome === "reused") {
        const local = await readFile(join(receiptDirectory, "events.jsonl"), "utf8").catch(() => "");
        row.diagnosticTimings = local.trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as unknown);
      }
      if (row.retained.length === 0 && row.outcome !== "couldn't run" && row.outcome !== "error") {
        await rm(receiptDirectory, { recursive: true, force: true });
      }
      await save();
      assert(row.retained.length === 0, `Uncertain execution retained inputs; inspect ${output} before cleanup/retry`);
      assert(result.kind === "result" && result.exitCode === 0, JSON.stringify(result));
      assert.equal(row.adapterSpawns, 1);
      if (row.runtime === "unknown") {
        assert.equal(row.outcome, "passed"); assert.equal(row.invocationRequests, 1);
        assert.equal(row.passLookups, 0); assert.equal(row.passWrites, 0);
      } else {
        assert.equal(row.runtime, "known");
        assert.equal(row.outcome, turn === "hit-candidate" ? "reused" : "passed");
        assert.equal(row.invocationRequests, turn === "hit-candidate" ? 0 : 1);
        assert.equal(row.passLookups, turn === "hit-candidate" ? 1 : 0);
        assert.equal(row.passWrites, turn === "hit-candidate" ? 0 : 1);
      }
      process.stdout.write(`${JSON.stringify(row)}\n`);
    }
    await removeGitBackedDir(root);
    retainedFixture = undefined;
    await save();
  }
} catch (cause) { await save(); throw cause; }
process.stdout.write(`Saved ${output}\n`);
