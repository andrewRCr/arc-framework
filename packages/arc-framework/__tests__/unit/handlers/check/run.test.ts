/** Check scheduling is observable through outcomes returned by the execution boundary. */
import { afterEach, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckDeclarationSchema } from "../../../../src/lib/checks/declaration.js";
import { declaredChecksExitCode, runDeclaredRequest, type DeclaredCheckResult, type DeclaredCheckDependencies } from "../../../../src/handlers/check/run.js";
import { readProjectedSelection } from "../../../../src/lib/checks/projected-selection.js";
import { makeGitProcessError, scriptGitExec, scriptRawGitExec } from "../../../helpers/git-exec-fake.js";
import { createCheckPassStore } from "../../../../src/lib/checks/record.js";
import { captureEnvironmentInputs } from "../../../../src/lib/checks/environment-inputs.js";
import { nodeEnvironmentCaptureIO } from "../../../../src/lib/checks/environment-file.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture(checks: Record<string, { fixes?: boolean; no_evidence_exit?: number; mode?: "files" | "selection"; root?: string; runtime_inputs?: string[][]; inputs?: string[]; gate?: "commit" | "push"; ci_only?: boolean; cache?: boolean; environment_inputs?: Record<string, "value" | "file"> }>, failSecondTreeWrite = false, globals: { global_runtime_inputs?: string[][] } = {}) {
  const root = await mkdtemp(join(tmpdir(), "arc-check-scheduling-"));
  roots.push(root);
  await mkdir(join(root, ".git"));
  const header = Buffer.alloc(12);
  header.write("DIRC");
  header.writeUInt32BE(2, 4);
  await writeFile(join(root, ".git/index"), Buffer.concat([header, createHash("sha1").update(header).digest()]));
  const definition = CheckDeclarationSchema.parse({ ...globals, checks: Object.fromEntries(Object.entries(checks).map(([id, check]) =>
    [id, { command: [id], cache: false, inputs: [], ...check }])) });
  const git = scriptGitExec([
    { match: ["rev-parse", "--verify", "--end-of-options", "HEAD^{commit}"], responses: [{ stdout: "a".repeat(40), stderr: "" }] },
    { match: ["rev-parse", "--path-format=absolute", "--git-path", "MERGE_HEAD"], responses: [{ stdout: join(root, ".git/MERGE_HEAD") }] },
    { match: ["rev-parse", "--git-path", "index"], responses: [{ stdout: join(root, ".git/index"), stderr: "" }] },
    { match: { prefix: ["rev-list"] }, responses: [{ stdout: "" }] },
    { match: ["add", "-A"], responses: [{ stdout: "", stderr: "" }] },
    { match: ["write-tree"], responses: failSecondTreeWrite
      ? [{ stdout: "b".repeat(40) }, { failure: { exitCode: 128, stderr: "index write failed" } }]
      : [{ stdout: "b".repeat(40), stderr: "" }] },
    { match: ["update-index", "--refresh"], responses: [{ stdout: "" }] },
    { match: ["ls-files", "--others", "--exclude-standard", "-z"], responses: [{ stdout: "" }] },
    { match: { prefix: ["rev-parse"] }, responses: [{ failure: { exitCode: 128, stderr: "missing automatic base" } }] },
  ]).exec;
  const completed: string[] = [];
  let active = 0;
  const io: DeclaredCheckDependencies & { availableParallelism: () => number } = {
    platform: "linux", availableParallelism: () => 2, git, gitInput: async () => "c".repeat(40),
    passes: { get: async () => null, put: async () => ({ status: "recorded" }) },
    readDeclaration: async () => ({ status: "valid", location: ".arc/system/arc-checks.yml", value: definition }),
    runtime: async () => ({ exitCode: 0, stdout: "" }),
    execute: async command => {
      const output = JSON.stringify({ completed: [...completed], active: ++active });
      await Promise.resolve();
      active--;
      completed.push(command[0]!);
      return { started: true, exitCode: 0, output };
    },
  };
  return { root, io, ids: Object.keys(checks) };
}

async function frozenInputFixture(root: string, io: DeclaredCheckDependencies, cwd = root) {
  await mkdir(cwd, { recursive: true });
  const original = join(cwd, "weights");
  const owned = join(root, "owned-inputs");
  await writeFile(original, "frozen");
  io.captureEnvironment = (inputs, checkCwd) => captureEnvironmentInputs(inputs, checkCwd,
    { environment: { WEIGHTS: "weights", MODE: "literal" },
      io: { ...nodeEnvironmentCaptureIO, createDirectory: async () => { await mkdir(owned); return owned; } } });
  return { original, owned };
}

it("keeps completed evidence and refuses queued checks after request interruption", async () => {
  const { root, io, ids } = await fixture({ first: {}, later: {}, last: {} });
  let interrupted = false;
  io.interrupted = () => interrupted;
  io.execute = async command => {
    await writeFile(join(root, `${command[0]}.started`), "started");
    interrupted = true;
    return { started: true, exitCode: 0, output: "completed before interruption" };
  };
  await expect(runDeclaredRequest(root, io, { form: { kind: "run", ids }, serial: true })).resolves.toMatchObject({
    kind: "result", exitCode: 2, result: { checks: [
      { id: "first", outcome: "passed", output: "completed before interruption" },
      { id: "later", outcome: "couldn't run", reason: expect.stringContaining("interrupted before dispatch") },
      { id: "last", outcome: "couldn't run", reason: expect.stringContaining("interrupted before dispatch") },
    ] },
  });
  expect(await readFile(join(root, "first.started"), "utf8")).toBe("started");
  await expect(readFile(join(root, "later.started"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(join(root, "last.started"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("shares frozen bytes across global/check probes and all path batches before reuse qualification", async () => {
  const { root, io, ids } = await fixture({ lint: { mode: "files", root: "tools", inputs: ["**"], cache: true,
    runtime_inputs: [["probe"]], environment_inputs: { WEIGHTS: "file" } } }, false, { global_runtime_inputs: [["global-probe"]] });
  const { original, owned } = await frozenInputFixture(root, io, join(root, "tools"));
  const paths = Array.from({ length: 100 }, (_, index) => `${"x".repeat(195)}${index}.ts`);
  const raw = paths.map(path => `:000000 100644 ${"0".repeat(40)} ${"d".repeat(40)} A\0${path}\0`).join("");
  const git = io.git;
  io.git = async (file, args, options) => args[0] === "diff" ? { stdout: raw, stderr: "" } : git(file, args, options);
  io.runtime = async (_command, _cwd, environment) => {
    const bytes = environment?.WEIGHTS === undefined ? "missing" : await readFile(environment.WEIGHTS, "utf8");
    await writeFile(original, "changed by probe");
    return { exitCode: bytes === "frozen" ? 0 : 1, stdout: bytes };
  };
  io.execute = async (_command, _cwd, _content, policy) => {
    const bytes = policy?.environment?.WEIGHTS === undefined ? "missing" : await readFile(policy.environment.WEIGHTS, "utf8");
    await writeFile(original, "changed by batch");
    return { started: true, exitCode: 0, output: bytes };
  };
  const result = await runDeclaredRequest(root, io, { form: { kind: "run", ids } });
  expect(result).toMatchObject({ kind: "result", exitCode: 0, result: { checks: [{ outcome: "passed", record: { status: "recorded" } }] } });
  if (result.kind !== "result") throw new Error(result.error.message);
  const batches = result.result.checks[0]?.output?.split("\n") ?? [];
  expect(batches.length).toBeGreaterThan(1);
  expect(batches.every(bytes => bytes === "frozen")).toBe(true);
  await expect(readFile(join(owned, "0.input"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("captures declared files even when caching is disabled and disposes the copies", async () => {
  const { root, io, ids } = await fixture({ lint: { environment_inputs: { WEIGHTS: "file" } } });
  const { owned } = await frozenInputFixture(root, io);
  io.execute = async (_command, _cwd, _content, policy) => ({ started: true, exitCode: 0,
    output: policy?.environment?.WEIGHTS === undefined ? "missing" : await readFile(policy.environment.WEIGHTS, "utf8") });
  await expect(runDeclaredRequest(root, io, { form: { kind: "run", ids } })).resolves.toMatchObject({
    kind: "result", exitCode: 0, result: { checks: [{ outcome: "passed", output: "frozen", record: { status: "not-recordable" } }] },
  });
  await expect(readFile(join(owned, "0.input"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("disposes captured files on a cache hit without executing the command again", async () => {
  const { root, io, ids } = await fixture({ lint: { cache: true, runtime_inputs: [["probe"]], environment_inputs: { WEIGHTS: "file" } } });
  const { owned } = await frozenInputFixture(root, io);
  const records = join(root, ".git/passes");
  await mkdir(records);
  io.passes = createCheckPassStore({ directory: async () => records, readFile: path => readFile(path, "utf8"),
    createFile: (path, content) => writeFile(path, content, { flag: "wx" }) });
  io.runtime = async (_command, _cwd, environment) => ({ exitCode: environment?.WEIGHTS === undefined ? 1 : 0,
    stdout: environment?.WEIGHTS === undefined ? "missing" : await readFile(environment.WEIGHTS, "utf8") });
  io.execute = async (_command, _cwd, _content, policy) => {
    await appendFile(join(root, "receipt"), "run\n");
    return { started: true, exitCode: 0,
      output: policy?.environment?.WEIGHTS === undefined ? "missing" : await readFile(policy.environment.WEIGHTS, "utf8") };
  };
  const request = { form: { kind: "run" as const, ids } };
  await expect(runDeclaredRequest(root, io, request)).resolves.toMatchObject({ kind: "result", result: { checks: [{ outcome: "passed", output: "frozen" }] } });
  await expect(runDeclaredRequest(root, io, request)).resolves.toMatchObject({ kind: "result", result: { checks: [{ outcome: "reused", output: "frozen" }] } });
  expect(await readFile(join(root, "receipt"), "utf8")).toBe("run\n");
  await expect(readFile(join(owned, "0.input"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("disposes frozen inputs after a command exception while retaining unavailable execution", async () => {
  const { root, io, ids } = await fixture({ lint: { environment_inputs: { WEIGHTS: "file" } } });
  const { owned } = await frozenInputFixture(root, io);
  io.execute = async () => { throw new Error("process boundary failed"); };
  await expect(runDeclaredRequest(root, io, { form: { kind: "run", ids } })).resolves.toMatchObject({
    kind: "result", exitCode: 2, result: { checks: [{ outcome: "couldn't run" }] },
  });
  await expect(readFile(join(owned, "0.input"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("disposes frozen inputs when fixer finalization throws without hiding the Git failure", async () => {
  const { root, io, ids } = await fixture({ format: { fixes: true, environment_inputs: { WEIGHTS: "file" } } });
  const { owned } = await frozenInputFixture(root, io);
  const git = io.git;
  io.git = async (file, args, options) => {
    if (args[0] === "update-index") throw makeGitProcessError({ command: file, args, exitCode: 128, stderr: "index unavailable" });
    return git(file, args, options);
  };
  io.execute = async (_command, _cwd, _content, policy) => {
    const bytes = policy?.environment?.WEIGHTS === undefined ? "missing" : await readFile(policy.environment.WEIGHTS, "utf8");
    await writeFile(join(root, "receipt"), bytes);
    return { started: true, exitCode: 0, output: bytes };
  };
  await expect(runDeclaredRequest(root, io, { form: { kind: "run", ids } })).rejects.toThrow("Could not resolve a fixer's rewrites");
  expect(await readFile(join(root, "receipt"), "utf8")).toBe("frozen");
  await expect(readFile(join(owned, "0.input"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("forecasts explicit file inputs without trying to capture an unavailable execution-step file", async () => {
  const { root, io, ids } = await fixture({ lint: { cache: true, environment_inputs: { WEIGHTS: "file" } } });
  const { original, owned } = await frozenInputFixture(root, io);
  await rm(original);
  await expect(runDeclaredRequest(root, io, { form: { kind: "run", ids }, dryRun: true })).resolves.toMatchObject({
    kind: "result", exitCode: 0, result: { checks: [{ outcome: "would run" }] },
  });
  await expect(readFile(join(owned, "0.input"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("finishes fixers serially in declaration order before ordinary checks execute", async () => {
  const { root, io, ids } = await fixture({ ordinary: {}, "fixer-one": { fixes: true }, "fixer-two": { fixes: true }, other: {} });
  const result = await runDeclaredRequest(root, io, { form: { kind: "run", ids } });
  expect(result.kind).toBe("result");
  if (result.kind !== "result") throw new Error(result.error.message);
  const outcomes = new Map(result.result.checks.map(check => [check.id, JSON.parse(check.output!)]));
  expect(outcomes.get("fixer-one")).toEqual({ completed: [], active: 1 });
  expect(outcomes.get("fixer-two")).toEqual({ completed: ["fixer-one"], active: 1 });
  expect(outcomes.get("ordinary").completed).toEqual(["fixer-one", "fixer-two"]);
});

it.each([false, true])("bounds ordinary checks by available parallelism and honors serial=%s", async serial => {
  const { root, io, ids } = await fixture({ first: {}, second: {}, third: {}, fourth: {}, fifth: {} });
  const result = await runDeclaredRequest(root, io, { form: { kind: "run", ids }, serial });
  expect(result.kind).toBe("result");
  if (result.kind !== "result") throw new Error(result.error.message);
  const concurrency = result.result.checks.map(check => (JSON.parse(check.output!) as { active: number }).active);
  expect(Math.max(...concurrency)).toBe(serial ? 1 : 2);
  expect(result.result.checks.map(check => check.id)).toEqual(ids);
  expect(result.exitCode).toBe(0);
});

it("keeps a no-op fixer's captured tree without requiring another tree write", async () => {
  const { root, io, ids } = await fixture({ format: { fixes: true } }, true);
  await expect(runDeclaredRequest(root, io, { form: { kind: "run", ids } })).resolves.toMatchObject({
    kind: "result", exitCode: 0, result: { checks: [{ id: "format", outcome: "passed" }] },
  });
});

it("reports an uncached pass as not recordable rather than recorded", async () => {
  const { root, io, ids } = await fixture({ lint: {} });
  const put = io.passes.put;
  let published = 0;
  io.passes = { ...io.passes, put: async record => { published++; return put(record); } };
  await expect(runDeclaredRequest(root, io, { form: { kind: "run", ids } })).resolves.toMatchObject({
    kind: "result", exitCode: 0, result: { checks: [{ id: "lint", outcome: "passed", record: { status: "not-recordable" } }] },
  });
  expect(published).toBe(0);
});

it("carries the notice a check's command reports into that check's result", async () => {
  const { root, io, ids } = await fixture({ lint: {}, other: {} });
  const execute = io.execute;
  io.execute = async (command, ...rest) => ({ ...await execute(command, ...rest),
    ...(command[0] === "lint" ? { notice: "ran on build-vm" } : {}) });
  const result = await runDeclaredRequest(root, io, { form: { kind: "run", ids } });
  if (result.kind !== "result") throw new Error(result.error.message);
  expect(result.result.checks.find(check => check.id === "lint")).toMatchObject({ outcome: "passed", notice: "ran on build-vm" });
  expect(result.result.checks.find(check => check.id === "other")).not.toHaveProperty("notice");
});

it("names each push check an increment leaves unrun, in declaration order, without running it", async () => {
  const { root, io } = await fixture({ whole: { gate: "push" }, commit: { gate: "commit" }, ci: { gate: "push", ci_only: true } });
  const ran: string[] = [];
  const execute = io.execute;
  io.execute = async (command, ...rest) => { ran.push(command[0]!); return execute(command, ...rest); };
  const result = await runDeclaredRequest(root, io, { form: { kind: "increment" } });
  if (result.kind !== "result") throw new Error(result.error.message);
  expect(result.exitCode).toBe(0);
  expect(result.result.checks).toMatchObject([
    { id: "whole", kind: "feedback", outcome: "not selected", reason: "runs at the push gate" },
    { id: "commit", kind: "enforcement" },
    { id: "ci", kind: "feedback", outcome: "not selected", reason: "CI-only check requires --ci" },
  ]);
  expect(result.result.verification).toContain("whole not selected");
  expect(ran).not.toContain("whole");
  expect(ran).not.toContain("ci");
  const inCi = await runDeclaredRequest(root, io, { form: { kind: "increment" }, ci: true });
  if (inCi.kind !== "result") throw new Error(inCi.error.message);
  expect(inCi.result.checks.find(check => check.id === "ci")).toMatchObject({ reason: "runs at the push gate" });
});

it("reports a push check an increment leaves unrun when nothing else is selected, and none for a segment", async () => {
  const { root, io } = await fixture({ whole: { gate: "push" } });
  await expect(runDeclaredRequest(root, io, { form: { kind: "increment" } })).resolves.toMatchObject({ kind: "result",
    exitCode: 0, result: { status: "completed", checks: [{ id: "whole", outcome: "not selected", reason: "runs at the push gate" }] } });
  const segment = await runDeclaredRequest(root, io, { form: { kind: "segment" } });
  if (segment.kind !== "result") throw new Error(segment.error.message);
  expect(segment.result.checks.map(check => check.reason)).not.toContain("runs at the push gate");
});

it("reports a check's declared no-evidence status as its own non-passing outcome, without a pass or retry", async () => {
  const { root, io, ids } = await fixture({ related: { no_evidence_exit: 5 } });
  io.execute = async () => ({ started: true, exitCode: 5, output: "No unit tests reach the changed files." });
  const result = await runDeclaredRequest(root, io, { form: { kind: "run", ids } });
  expect(result).toMatchObject({ kind: "result", exitCode: 1, result: {
    checks: [{ id: "related", outcome: "no evidence", output: "No unit tests reach the changed files." }],
    verification: "Checks: related no evidence.",
  } });
  if (result.kind !== "result") throw new Error(result.error.message);
  expect(result.result.checks[0]).not.toHaveProperty("record");
  expect(result.result.checks[0]).not.toHaveProperty("remedy");
});

it("reports a check killed before it finished as couldn't run, with a retry and without a pass", async () => {
  const { root, io, ids } = await fixture({ heavy: {} });
  io.execute = async () => ({ started: true, exitCode: 137, output: "Killed" });
  const result = await runDeclaredRequest(root, io, { form: { kind: "run", ids } });
  expect(result).toMatchObject({ kind: "result", exitCode: 2, result: { checks: [{
    id: "heavy", outcome: "couldn't run", reason: expect.stringContaining("killed before it finished"), output: "Killed",
    remedy: expect.stringMatching(/^arc check run heavy\b/u),
  }] } });
  if (result.kind !== "result") throw new Error(result.error.message);
  expect(result.result.checks[0]).not.toHaveProperty("record");
});

it("reports a check that fails on a locked but uninstalled package as couldn't run, then passes once installed", async () => {
  const { root, io, ids } = await fixture({ lint: {} });
  await writeFile(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3,
    packages: { "": {}, "node_modules/eslint-plugin-jsdoc": { dev: true } } }));
  const output = `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'eslint-plugin-jsdoc' imported from ${root}/eslint.config.js`;
  io.execute = async () => ({ started: true, exitCode: 2, output });
  const missing = await runDeclaredRequest(root, io, { form: { kind: "run", ids } });
  expect(missing).toMatchObject({ kind: "result", exitCode: 2, result: { checks: [{
    id: "lint", outcome: "couldn't run", output,
    reason: "eslint-plugin-jsdoc is in package-lock.json but not installed; run npm ci, then retry",
    remedy: expect.stringMatching(/^arc check run lint\b/u),
  }] } });
  if (missing.kind !== "result") throw new Error(missing.error.message);
  expect(missing.result.checks[0]).not.toHaveProperty("record");

  await mkdir(join(root, "node_modules/eslint-plugin-jsdoc"), { recursive: true });
  io.execute = async () => ({ started: true, exitCode: 0, output: "" });
  await expect(runDeclaredRequest(root, io, { form: { kind: "run", ids } })).resolves.toMatchObject({
    kind: "result", exitCode: 0, result: { checks: [{ id: "lint", outcome: "passed" }] },
  });
});

it("keeps a missing package the lockfile does not declare as a failed check", async () => {
  const { root, io, ids } = await fixture({ lint: {} });
  await writeFile(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "": {} } }));
  io.execute = async () => ({ started: true, exitCode: 2,
    output: `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'left-pad' imported from ${root}/src/index.js` });
  const result = await runDeclaredRequest(root, io, { form: { kind: "run", ids } });
  expect(result).toMatchObject({ kind: "result", exitCode: 1, result: { checks: [{ id: "lint", outcome: "failed" }] } });
  if (result.kind !== "result") throw new Error(result.error.message);
  expect(result.result.checks[0]).not.toHaveProperty("reason");
});

it("keeps a declared no-evidence status of 137 as no evidence rather than a kill", async () => {
  const { root, io, ids } = await fixture({ related: { no_evidence_exit: 137 } });
  io.execute = async () => ({ started: true, exitCode: 137, output: "" });
  const result = await runDeclaredRequest(root, io, { form: { kind: "run", ids } });
  expect(result).toMatchObject({ kind: "result", exitCode: 1, result: { checks: [{ id: "related", outcome: "no evidence" }] } });
  if (result.kind !== "result") throw new Error(result.error.message);
  expect(result.result.checks[0]).not.toHaveProperty("reason");
  expect(result.result.checks[0]).not.toHaveProperty("remedy");
});

it("reports the same status as a failure when the check does not declare it", async () => {
  const { root, io, ids } = await fixture({ related: {} });
  io.execute = async () => ({ started: true, exitCode: 5, output: "" });
  await expect(runDeclaredRequest(root, io, { form: { kind: "run", ids } })).resolves.toMatchObject({
    kind: "result", exitCode: 1, result: { checks: [{ id: "related", outcome: "failed" }] },
  });
});

it("reports an inherited object name as an unknown hook skip", async () => {
  const { root, io } = await fixture({});
  io.git = scriptGitExec([
    { match: ["rev-parse", "--verify", "--end-of-options", "HEAD^{commit}"], responses: [{ failure: { exitCode: 128 } }] },
    { match: ["rev-parse", "--git-path", "index"], responses: [{ stdout: join(root, ".git/index"), stderr: "" }] },
    { match: ["write-tree"], responses: [{ stdout: "b".repeat(40), stderr: "" }] },
  ]).exec;
  await expect(runDeclaredRequest(root, io, { form: { kind: "pre-commit" }, skip: ["constructor"] }))
    .resolves.toMatchObject({ kind: "result", exitCode: 0, result: { ignoredSkips: ["constructor"] } });
});

it("refuses an inherited object name that is not an explicitly declared check", async () => {
  const { root, io } = await fixture({});
  await expect(runDeclaredRequest(root, io, { form: { kind: "run", ids: ["constructor"] } }))
    .resolves.toMatchObject({ kind: "error", exitCode: 2, error: { kind: "refused", message: expect.stringContaining("Unknown check constructor") } });
});

it("runs an explicitly declared check whose name also occurs on the object prototype", async () => {
  const { root, io } = await fixture({ constructor: {} });
  await expect(runDeclaredRequest(root, io, { form: { kind: "run", ids: ["constructor"] } }))
    .resolves.toMatchObject({ kind: "result", exitCode: 0, result: { checks: [{ id: "constructor", outcome: "passed" }] } });
});

const exitCases: Array<{ outcomes: DeclaredCheckResult["outcome"][]; exit: 0 | 1 | 2 }> = [
  { outcomes: [], exit: 0 },
  { outcomes: ["passed", "reused", "skipped", "not selected", "would run"], exit: 0 },
  { outcomes: ["failed", "passed"], exit: 1 },
  { outcomes: ["no evidence", "passed"], exit: 1 },
  { outcomes: ["no evidence", "couldn't run"], exit: 2 },
  { outcomes: ["failed", "couldn't run"], exit: 2 },
  { outcomes: ["couldn't run", "failed"], exit: 2 },
];
it.each(exitCases)("classifies $outcomes with exit $exit regardless of result kind", ({ outcomes, exit }) => {
  for (const kind of ["enforcement", "feedback"] as const) {
    const checks: DeclaredCheckResult[] = outcomes.map((outcome, index) => ({ id: `check-${index}`, kind, outcome,
      ...(outcome === "not selected" ? { reason: "inputs unchanged" } : {}),
    }));
    expect(declaredChecksExitCode(checks)).toBe(exit);
  }
});

it.each([1, 255])("reports runner unavailability at exit %s with a retry, then passes after recovery", async exitCode => {
  const { root, io, ids } = await fixture({ heavy: { no_evidence_exit: 1 } });
  io.execute = async () => ({ started: true, exitCode, output: "ssh disconnected",
    notice: "not run: VM connection dropped", notRunReason: "VM connection dropped" });
  const result = await runDeclaredRequest(root, io, { form: { kind: "run", ids } });
  expect(result).toMatchObject({ kind: "result", exitCode: 2, result: { checks: [{
    id: "heavy", outcome: "couldn't run", reason: "VM connection dropped", output: "ssh disconnected",
    notice: "not run: VM connection dropped", remedy: expect.stringMatching(/^arc check run heavy\b/u),
  }] } });
  if (result.kind !== "result") throw new Error(result.error.message);
  expect(result.result.checks[0]).not.toHaveProperty("record");
  io.execute = async () => ({ started: true, exitCode: 0, output: "complete" });
  await expect(runDeclaredRequest(root, io, { form: { kind: "run", ids } })).resolves.toMatchObject({
    kind: "result", exitCode: 0, result: { checks: [{ outcome: "passed", output: "complete" }] },
  });
});

it.each(["not-run reason", "not started", "throws"])("keeps a completed batch failure when a later batch %s", async fault => {
  const { root, io, ids } = await fixture({ lint: { mode: "files", inputs: ["**"] } });
  const paths = Array.from({ length: 100 }, (_, index) => `${"x".repeat(195)}${index}.ts`);
  const raw = paths.map(path => `:000000 100644 ${"0".repeat(40)} ${"d".repeat(40)} A\0${path}\0`).join("");
  const git = io.git;
  io.git = async (file, args, options) => args[0] === "diff"
    ? { stdout: raw, stderr: "" } : git(file, args, options);
  let batch = 0;
  io.execute = async () => {
    if (++batch === 1) return { started: true, exitCode: 1, output: "lint violation" };
    if (fault === "throws") throw new Error("VM connection dropped");
    return { started: fault !== "not started", exitCode: 255, output: "ssh disconnected",
      ...(fault === "not-run reason" ? { notRunReason: "VM connection dropped" } : {}) };
  };
  await expect(runDeclaredRequest(root, io, { form: { kind: "run", ids } })).resolves.toMatchObject({
    kind: "result", exitCode: 1, result: { checks: [{ outcome: "failed",
      output: `lint violation\n${fault === "throws" ? "Error: VM connection dropped" : "ssh disconnected"}`,
      reason: expect.stringMatching(/VM connection dropped|did not start/u) }] },
  });
});


it("keeps the unconnected projected selection empty and successful", async () => {
  expect(await readProjectedSelection("/unused", { changed: false })).toEqual({ status: "ok", paths: [] });
  expect(await readProjectedSelection("/unused", { changed: true })).toEqual({ status: "ok", paths: [] });
});

it.each([
  { request: { form: { kind: "increment" } }, changed: true },
  { request: { form: { kind: "segment" } }, changed: true },
  { request: { form: { kind: "run", ids: ["selected"] } }, changed: false },
  { request: { form: { kind: "run", ids: ["selected"] }, scope: { kind: "all" } }, changed: false },
  { request: { form: { kind: "run", ids: ["selected"] }, scope: { kind: "changed" } }, changed: true },
  { request: { form: { kind: "run", ids: ["selected"] }, scope: { kind: "staged" } }, changed: true },
  { request: { form: { kind: "run", ids: ["selected"] }, scope: { kind: "range" } }, changed: true },
] satisfies { request: import("../../../../src/lib/checks/request.js").CheckRequest; changed: boolean }[])("resolves projected scope for $request", async ({ request, changed }) => {
  const { root, io } = await fixture({ selected: { mode: "selection" } });
  io.readProjectedSelection = (_root, options) => Promise.resolve({ status: "unavailable", reason: options.changed === changed ? "expected scope" : "wrong scope" });
  const result = await runDeclaredRequest(root, io, request);
  if (result.kind === "error") throw new Error(result.error.message);
  expect(result).toMatchObject({ kind: "result", exitCode: 2,
    result: { checks: [{ id: "selected", outcome: "couldn't run", reason: "expected scope" }] } });
});

it("shares one unavailable projected read and recovers on the same request", async () => {
  const { root, io, ids } = await fixture({ selected: { mode: "selection" }, second: { mode: "selection" }, ordinary: {} });
  let reads = 0;
  io.readProjectedSelection = () => { reads++; return Promise.reject(new Error("selection index unreadable")); };
  const request = { form: { kind: "run" as const, ids }, serial: true };
  await expect(runDeclaredRequest(root, io, request)).resolves.toMatchObject({ kind: "result", exitCode: 2,
    result: { checks: [
      { id: "selected", outcome: "couldn't run", reason: expect.stringContaining("selection index unreadable") },
      { id: "second", outcome: "couldn't run", reason: expect.stringContaining("selection index unreadable") },
      { id: "ordinary", outcome: "passed" },
    ] } });
  expect(reads).toBe(1);
  io.readProjectedSelection = () => Promise.resolve({ status: "ok", paths: [] });
  await expect(runDeclaredRequest(root, io, request)).resolves.toMatchObject({ kind: "result", exitCode: 0,
    result: { checks: [{ outcome: "not selected", reason: "no files to check" },
      { outcome: "not selected", reason: "no files to check" }, { outcome: "passed" }] } });
});

it("does not read projected state without a requested selection check", async () => {
  const { root, io, ids } = await fixture({ ordinary: {} });
  let reads = 0;
  io.readProjectedSelection = () => { reads++; return Promise.reject(new Error("not requested")); };
  await expect(runDeclaredRequest(root, io, { form: { kind: "run", ids } })).resolves.toMatchObject({ exitCode: 0 });
  expect(reads).toBe(0);
});

async function projectedFixture() {
  const result = await fixture({ selected: { mode: "selection", inputs: ["**"], root: "tools", runtime_inputs: [["node", "--version"]] }, ordinary: {} });
  let paths: string[] = [];
  result.io.rawGit = scriptRawGitExec([
    { match: ["hash-object", "--stdin"], responses: [{ stdout: Buffer.from("a".repeat(40)) }] },
    { match: { prefix: ["update-index"] }, responses: [({ options }) => {
      paths = Buffer.from(options?.input ?? []).toString("utf8").split("\0").filter(Boolean).map(entry => entry.slice(entry.indexOf("\t") + 1));
      return { stdout: Buffer.alloc(0) };
    }] },
    { match: { prefix: ["ls-files"] }, responses: [() => ({ stdout: Buffer.from(paths.join("\0") + (paths.length ? "\0" : "")) })] },
  ]).exec;
  result.io.readProjectedSelection = () => Promise.resolve({ status: "ok", paths: [
    ".arc/active/current/meta-unit.md", ".arc/active/in-flight/other/notes-other.md",
  ] });
  result.io.execute = (command, _cwd, content) => Promise.resolve({ started: true, exitCode: 0,
    output: JSON.stringify({ command, content: content ?? null }) });
  return result;
}

it("intersects named directories with projected paths and keeps root-relative literal arguments", async () => {
  const { root, io } = await projectedFixture();
  const result = await runDeclaredRequest(root, io, { form: { kind: "run", ids: ["selected"] }, ci: true,
    scope: { kind: "paths", paths: [".arc/active/current", ".arc/missing.md"] } });
  expect(result).toMatchObject({ kind: "result", exitCode: 0, result: { checks: [{ outcome: "passed",
    output: JSON.stringify({ command: ["selected", "../.arc/active/current/meta-unit.md"], content: null }),
    record: { status: "not-recordable" },
  }] } });
});


it("executes projected paths every time without pass or runtime evidence", async () => {
  const { root, io } = await projectedFixture();
  io.runtime = () => Promise.reject(new Error("selection must not read runtime evidence"));
  io.passes = { get: () => Promise.reject(new Error("selection must not read passes")),
    put: () => Promise.reject(new Error("selection must not write passes")) };
  let executions = 0;
  io.execute = command => Promise.resolve({ started: true, exitCode: 0, output: JSON.stringify({ executions: ++executions, command }) });
  for (const run of [1, 2]) {
    const result = await runDeclaredRequest(root, io, { form: { kind: "run", ids: ["selected"] } });
    expect(result).toMatchObject({ exitCode: 0, kind: "result", result: { checks: [{ outcome: "passed",
      record: { status: "not-recordable" }, output: JSON.stringify({ executions: run, command: ["selected",
        "../.arc/active/current/meta-unit.md", "../.arc/active/in-flight/other/notes-other.md"] }) }] } });
  }
});

it.each(["increment", "segment"] as const)("retries failed %s selection feedback with changed scope", async kind => {
  const { root, io } = await projectedFixture();
  io.execute = () => Promise.resolve({ started: true, exitCode: 1, output: "bad Markdown" });
  expect(await runDeclaredRequest(root, io, { form: { kind } })).toMatchObject({ kind: "result", exitCode: 1,
    result: { checks: [{ outcome: "failed", kind: "feedback", remedy: "arc check run selected --changed" }] } });
});

it("keeps ordinary serial results when projected matching fails, then recovers", async () => {
  const { root, io } = await projectedFixture();
  const original = io.rawGit;
  if (!original) throw new Error("Missing matcher fixture");
  io.rawGit = () => Promise.reject(new Error("temporary index denied"));
  const request = { form: { kind: "run" as const, ids: ["selected", "ordinary"] }, serial: true };
  expect(await runDeclaredRequest(root, io, request)).toMatchObject({ kind: "result", exitCode: 2,
    result: { checks: [{ outcome: "couldn't run", reason: expect.stringContaining("temporary index denied"),
      remedy: "arc check run selected --all" }, { id: "ordinary", outcome: "passed" }] } });
  io.rawGit = original;
  expect(await runDeclaredRequest(root, io, request)).toMatchObject({ kind: "result", exitCode: 0,
    result: { checks: [{ outcome: "passed" }, { outcome: "passed" }] } });
});

it("forecasts bounded projected batches without execution", async () => {
  const { root, io } = await projectedFixture();
  const paths = Array.from({ length: 300 }, (_, i) => `.arc/active/current/${i}-${"a".repeat(100)}.md`);
  io.readProjectedSelection = () => Promise.resolve({ status: "ok", paths });
  io.execute = () => Promise.reject(new Error("dry run must not execute"));
  const result = await runDeclaredRequest(root, io, { form: { kind: "run", ids: ["selected"] }, dryRun: true });
  expect(result).toMatchObject({ kind: "result", exitCode: 0, result: { checks: [{ outcome: "would run", mode: "selection" }] } });
  if (result.kind !== "result") throw new Error(result.error.message);
  const batches = result.result.checks[0]?.batches ?? [];
  expect(batches.length).toBeGreaterThan(1);
  expect(batches.flatMap(batch => batch.slice(1))).toEqual(paths.map(path => `../${path}`));
});


it("runs projected files against their live content when staged and worktree trees differ", async () => {
  const { root, io } = await projectedFixture();
  const git = io.git;
  let writes = 0;
  io.git = (command, args, options) => args[0] === "write-tree"
    ? Promise.resolve({ stdout: (++writes === 1 ? "b" : "d").repeat(40) }) : git(command, args, options);
  const result = await runDeclaredRequest(root, io, { form: { kind: "run", ids: ["selected"] }, scope: { kind: "staged" } });
  expect(result).toMatchObject({ kind: "result", exitCode: 0, result: { checks: [{ outcome: "passed",
    output: JSON.stringify({ command: ["selected", "../.arc/active/current/meta-unit.md",
      "../.arc/active/in-flight/other/notes-other.md"], content: null }) }] } });
});
