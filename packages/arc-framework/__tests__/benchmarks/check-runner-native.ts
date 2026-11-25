/** Reproducible native-route counters and explicit-file capture costs; no performance gate.
 * Run from repository root: node --import tsx packages/arc-framework/__tests__/benchmarks/check-runner-native.ts <output.json>
 * An explicit output path is required; CHECK_BENCH_SAMPLES selects >=3 samples.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { arch } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { removeGitBackedDir } from "../helpers/temp-repo.js";
import { runDeclaredRequest, type DeclaredCheckDependencies } from "../../src/handlers/check/run.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { captureEnvironmentInputs } from "../../src/lib/checks/environment-inputs.js";
import { nodeEnvironmentCaptureIO } from "../../src/lib/checks/environment-file.js";
import { runCheckProcess } from "../../src/lib/checks/process.js";
import { createCheckPassStore } from "../../src/lib/checks/record.js";
import { readTypedProjectFile } from "../../src/lib/config/typed-file-reader.js";
import { createExecaGitExec, createExecaGitExecInput, createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";
import { readMachineCheckRunner } from "../../src/lib/checks/runner/machine-config.js";
import { startCheckRunnerProcess } from "../../src/lib/checks/runner/session-process.js";
import { nodeSourcePresentationIO } from "../../src/lib/checks/runner/source-io.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const output = process.argv[2];
assert(output !== undefined, "Provide an explicit benchmark JSON output path");
const destination = resolve(output);
const samples = Number(process.env.CHECK_BENCH_SAMPLES ?? 3);
assert(Number.isSafeInteger(samples) && samples >= 3, "CHECK_BENCH_SAMPLES must be an integer >=3");
await mkdir(dirname(destination), { recursive: true });
const scratch = await mkdtemp(join(dirname(destination), "check-native-cost-work-"));
const git = createExecaGitExec();
const counts = { configurationReads: 0, preparationCalls: 0, sourceCaptureDirectories: 0,
  adapterSpawns: 0, ordinaryCommandSpawns: 0, nativeExplicitCaptureCalls: 0 };

function distribution(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { samples: values, minMs: sorted[0], medianMs: sorted[Math.floor(sorted.length / 2)], maxMs: sorted.at(-1) };
}

try {
  const repository = join(scratch, "repository");
  const home = join(scratch, "machine-home");
  await Promise.all([mkdir(repository), mkdir(home)]);
  await git("git", ["init", "-q", "-b", "main"], { cwd: repository });
  await mkdir(join(repository, ".arc/system"), { recursive: true });
  await writeFile(join(repository, "input.txt"), "committed input\n");
  const declaration = CheckDeclarationSchema.parse({ checks: { native: {
    command: [process.execPath, "-e", "process.stdout.write('native complete\\n')"],
    runner: true, cache: false, inputs: ["input.txt"],
  } } });
  await writeFile(join(repository, ".arc/system/arc-checks.yml"), JSON.stringify(declaration));
  await git("git", ["add", "-A"], { cwd: repository });
  await git("git", ["-c", "core.hooksPath=/nonexistent/check-benchmark-no-hooks", "-c", "user.name=Check benchmark fixture",
    "-c", "user.email=check-benchmark@example.invalid", "commit", "-qm", "fixture"], { cwd: repository });
  await writeFile(join(repository, "input.txt"), "forming input\n");
  const passDirectory = join(repository, ".git/check-benchmark-passes");
  await mkdir(passDirectory);
  const io: DeclaredCheckDependencies = {
    platform: process.platform, availableParallelism: () => 1, git,
    gitInput: createExecaGitExecInput(), rawGit: createExecaRawGitExec(repository),
    passes: createCheckPassStore({ directory: async () => passDirectory,
      readFile: path => readFile(path, "utf8"), createFile: (path, content) => writeFile(path, content, { flag: "wx" }) }),
    readDeclaration: directory => readTypedProjectFile(directory, "check-declaration", CheckDeclarationSchema),
    readRunnerConfiguration: check => readMachineCheckRunner(check, { home: () => home,
      readFile: path => { counts.configurationReads++; return readFile(path, "utf8"); } }),
    captureEnvironment: (...args) => { counts.nativeExplicitCaptureCalls++; return captureEnvironmentInputs(...args); },
    prepareExecution: input => {
      counts.preparationCalls++;
      return prepareSelectedCheckExecution(input, { git, gitRaw: createExecaRawGitExec(repository),
        source: { ...nodeSourcePresentationIO, files: { ...nodeSourcePresentationIO.files,
          createDirectory: () => { counts.sourceCaptureDirectories++; return nodeSourcePresentationIO.files.createDirectory(); } } },
        launch: options => { counts.adapterSpawns++; return startCheckRunnerProcess(options); } });
    },
    execute: (...args) => { counts.ordinaryCommandSpawns++; return runCheckProcess(...args); },
    runtime: (command, cwd, environment) => runCheckProcess(command, cwd, undefined, { rawStdout: true, environment }),
  };
  const nativeMs: number[] = [];
  const outcomes: string[] = [];
  for (let index = 0; index < samples; index++) {
    const started = performance.now();
    const result = await runDeclaredRequest(repository, io, { form: { kind: "run", ids: ["native"] }, serial: true });
    nativeMs.push(performance.now() - started);
    assert.equal(result.kind, "result");
    assert.equal(result.exitCode, 0);
    const check = result.result.checks[0];
    assert(check !== undefined, "Native check must produce a result");
    assert.equal(check.outcome, "passed");
    assert.equal(check.output, "native complete");
    outcomes.push(check.outcome);
  }
  assert.deepEqual(counts, { configurationReads: samples, preparationCalls: 0, sourceCaptureDirectories: 0,
    adapterSpawns: 0, ordinaryCommandSpawns: samples, nativeExplicitCaptureCalls: 0 });

  const captures = [];
  for (const bytes of [64, 1024 * 1024]) {
    const file = join(scratch, `declared-${bytes}.bin`);
    const content = Buffer.alloc(bytes, 0xa5);
    await writeFile(file, content);
    const identity = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    const captureMs: number[] = [], disposeMs: number[] = [];
    let readCalls = 0, maximumReadBufferBytes = 0, readBytes = 0, createdDirectories = 0;
    for (let index = 0; index < samples; index++) {
      const started = performance.now();
      const capture = await captureEnvironmentInputs({ CHECK_BENCH_FILE: "file" }, scratch, {
        environment: { CHECK_BENCH_FILE: file }, io: { ...nodeEnvironmentCaptureIO,
          createDirectory: () => { createdDirectories++; return mkdtemp(join(scratch, "owned-input-")); },
          openInput: async path => {
            const opened = await nodeEnvironmentCaptureIO.openInput(path);
            return { ...opened, read: async buffer => {
              readCalls++; maximumReadBufferBytes = Math.max(maximumReadBufferBytes, buffer.length);
              const count = await opened.read(buffer); readBytes += count; return count;
            } };
          } },
      });
      captureMs.push(performance.now() - started);
      const binding = capture.bindings.CHECK_BENCH_FILE;
      assert(binding?.kind === "file" && binding.state === "file");
      assert.equal(binding.digest, identity);
      assert.equal(binding.bytes, bytes);
      assert.deepEqual(await readFile(binding.path), content);
      const disposing = performance.now();
      await capture.dispose();
      disposeMs.push(performance.now() - disposing);
      await assert.rejects(access(binding.path));
    }
    assert.equal(readBytes, bytes * samples);
    captures.push({ bytes, capture: distribution(captureMs), disposal: distribution(disposeMs),
      readCalls, maximumReadBufferBytes, readBytes, createdDirectories, cleanupVerified: true });
  }
  const result = {
    command: "node --import tsx packages/arc-framework/__tests__/benchmarks/check-runner-native.ts <output.json>",
    timestamp: new Date().toISOString(), revision: (await git("git", ["rev-parse", "HEAD"], { cwd: root })).stdout,
    runtime: { node: process.version, platform: process.platform, arch: arch(), git: (await git("git", ["--version"])).stdout },
    fixture: { nativeInputBytes: Buffer.byteLength("forming input\n"), explicitFileBytes: [64, 1024 * 1024], samples },
    native: { eligible: true, machineConfigured: false, cache: false, request: distribution(nativeMs), counts, outcomes },
    declaredFiles: captures,
    interpretation: "Native request totals include native Git snapshot/selection and an ordinary Node command. Routed source/preparation/spawn counters are zero. Explicit file capture is measured independently; these samples are observations, not thresholds.",
  };
  await writeFile(destination, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ destination, ...result }, null, 2));
} finally {
  await removeGitBackedDir(scratch);
}
