/** Check scheduling is observable through outcomes returned by the execution boundary. */
import { afterEach, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckDeclarationSchema } from "../../../../src/lib/checks/declaration.js";
import { declaredChecksExitCode, runDeclaredRequest, type DeclaredCheckResult, type DeclaredCheckDependencies } from "../../../../src/handlers/check/run.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture(checks: Record<string, { fixes?: boolean; no_evidence_exit?: number }>, failSecondTreeWrite = false) {
  const root = await mkdtemp(join(tmpdir(), "arc-check-scheduling-"));
  roots.push(root);
  await mkdir(join(root, ".git"));
  const header = Buffer.alloc(12);
  header.write("DIRC");
  header.writeUInt32BE(2, 4);
  await writeFile(join(root, ".git/index"), Buffer.concat([header, createHash("sha1").update(header).digest()]));
  const definition = CheckDeclarationSchema.parse({ checks: Object.fromEntries(Object.entries(checks).map(([id, check]) =>
    [id, { command: [id], cache: false, inputs: [], ...check }])) });
  const git = scriptGitExec([
    { match: ["rev-parse", "--verify", "--end-of-options", "HEAD^{commit}"], responses: [{ stdout: "a".repeat(40), stderr: "" }] },
    { match: ["rev-parse", "--git-path", "index"], responses: [{ stdout: join(root, ".git/index"), stderr: "" }] },
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
    output: "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'left-pad' imported from /repo/src/index.js" });
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
