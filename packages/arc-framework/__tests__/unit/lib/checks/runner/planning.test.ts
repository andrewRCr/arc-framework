/** Portable plans retain native argv, cwd and content channels before placement. */
import { afterEach, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { batchPortableCheckPaths } from "../../../../../src/lib/checks/batching.js";
import { CheckDeclarationSchema } from "../../../../../src/lib/checks/declaration.js";
import { freezeSourcePresentation } from "../../../../../src/lib/checks/runner/source-presentation.js";
import { planCheckExecution } from "../../../../../src/lib/checks/runner/planning.js";
import type { SourceCoordinates } from "../../../../../src/lib/checks/runner/contract-source.js";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map(remove => remove())); });

async function fixture(coordinates: SourceCoordinates = {
  tree: "a".repeat(40), head: "b".repeat(40), base: "c".repeat(40), merged: ["d".repeat(40), "e".repeat(40)],
}, paths = ["packages/check/a.ts", "src/quote & é.ts"]) {
  const callerRoot = await mkdtemp(join(tmpdir(), "arc-check-plan-"));
  cleanup.push(() => rm(callerRoot, { recursive: true, force: true }));
  await mkdir(join(callerRoot, "packages", "check"), { recursive: true });
  await mkdir(join(callerRoot, "src"));
  for (const path of paths) {
    await mkdir(dirname(join(callerRoot, path)), { recursive: true });
    await writeFile(join(callerRoot, path), "source\n");
  }
  const source = await freezeSourcePresentation(callerRoot, Buffer.from(`${paths.join("\0")}\0`), coordinates);
  cleanup.push(() => source.remove());
  return { callerRoot, source, paths };
}

it("retains literal nonshell argv and received path order relative to the captured check cwd", async () => {
  const input = await fixture();
  const command = ["node", "script.cjs", "--literal=;&$quoted"];
  const check = CheckDeclarationSchema.parse({ checks: { example: { command, mode: "files", root: "packages/check", runner: true } } }).checks.example!;
  const plan = await planCheckExecution({ ...input, check });
  expect(plan.invocations).toEqual([{ id: expect.any(String), shell: false, cwd: "packages/check",
    argv: [...command, "a.ts", "../../src/quote & é.ts"], commandContent: {
      tree: "a".repeat(40), base: "c".repeat(40), merged: ["d".repeat(40), "e".repeat(40)],
    } }]);
  expect(plan.probes).toEqual({ global: [], check: [] });
});

it("fixes complete portable path partitions and unique invocation IDs before placement without expanding shards", async () => {
  const paths = Array.from({ length: 20 }, (_, index) => `packages/check/src/${index}/${"&".repeat(100)}`);
  const input = await fixture(undefined, paths);
  const command = ["npm", "run", "lint", "--", "--consumer-option", "x".repeat(500)];
  const check = CheckDeclarationSchema.parse({ checks: { example: { command, mode: "files", root: "packages/check",
    runner: true, shards: { count: 3, argument: "--partition={index}" } } } }).checks.example!;
  const plan = await planCheckExecution({ ...input, check });
  expect(plan.invocations.map(invocation => invocation.argv.slice(command.length).length)).toEqual([17, 3]);
  expect(plan.invocations.flatMap(invocation => invocation.argv.slice(command.length))).toEqual(paths.map(path => path.slice("packages/check/".length)));
  expect(new Set(plan.invocations.map(invocation => invocation.id)).size).toBe(2);
  for (const invocation of plan.invocations) expect(invocation.argv.slice(0, command.length)).toEqual(command);
});

it("retains files content coordinates when paths are withheld and omits unavailable optional coordinates", async () => {
  const input = await fixture({ tree: "a".repeat(40), merged: [] });
  const command = ["node", "script.cjs"];
  const check = CheckDeclarationSchema.parse({ checks: { example: { command, mode: "files", pass_paths: false, runner: true } } }).checks.example!;
  const plan = await planCheckExecution({ ...input, check });
  expect(plan.invocations).toEqual([{ id: expect.any(String), shell: false, cwd: ".", argv: command,
    commandContent: { tree: "a".repeat(40) } }]);
});

it("retains one explicit shell command string and omits project content channels", async () => {
  const input = await fixture();
  const command = "printf 'literal && punctuation; $VALUE'";
  const check = CheckDeclarationSchema.parse({ checks: { example: { command, shell: true, mode: "project", runner: true } } }).checks.example!;
  const plan = await planCheckExecution({ ...input, check });
  expect(plan.invocations).toEqual([{ id: expect.any(String), shell: true, cwd: ".", argv: [command] }]);
});

it("scopes global and check probes independently, omits their content channels and assigns unique command IDs", async () => {
  const input = await fixture();
  const globalRuntimeInputs = [["node", "-p", "process.version"], ["git", "--version"]];
  const runtime_inputs = [["node", "--version"], ["node", "-p", "'literal ; value'"]];
  const check = CheckDeclarationSchema.parse({ checks: { example: { command: ["node", "check.cjs"], mode: "project",
    root: "packages/check", runner: true, runtime_inputs } } }).checks.example!;
  const plan = await planCheckExecution({ ...input, check, globalRuntimeInputs });
  expect(plan.probes.global).toEqual(globalRuntimeInputs.map(argv => ({ id: expect.any(String), argv, cwd: "." })));
  expect(plan.probes.check).toEqual(runtime_inputs.map(argv => ({ id: expect.any(String), argv, cwd: "packages/check" })));
  const commands = [...plan.invocations, ...plan.probes.global, ...plan.probes.check];
  expect(new Set(commands.map(command => command.id)).size).toBe(5);
  for (const probe of [...plan.probes.global, ...plan.probes.check]) expect(Object.hasOwn(probe, "commandContent")).toBe(false);
});

it("owns command, path, coordinate and probe inputs before asynchronous cwd validation", async () => {
  const input = await fixture();
  const globalRuntimeInputs = [["git", "--version"]];
  const check = CheckDeclarationSchema.parse({ checks: { example: { command: ["node", "check.cjs"], mode: "files",
    root: "packages/check", runner: true, runtime_inputs: [["node", "--version"]] } } }).checks.example!;
  const pending = planCheckExecution({ ...input, check, globalRuntimeInputs });
  if (typeof check.command === "string") throw new Error("Expected argv declaration");
  check.command[0] = "changed-command";
  check.root = "src";
  check.runtime_inputs[0]!.push("changed-check-probe");
  globalRuntimeInputs[0]!.push("changed-global-probe");
  input.paths.reverse();
  input.source.manifest.coordinates.merged.reverse();
  const plan = await pending;
  expect(plan.invocations[0]).toMatchObject({ argv: ["node", "check.cjs", "a.ts", "../../src/quote & é.ts"],
    cwd: "packages/check", commandContent: { merged: ["d".repeat(40), "e".repeat(40)] } });
  expect(plan.probes.global[0]).toMatchObject({ argv: ["git", "--version"], cwd: "." });
  expect(plan.probes.check[0]).toMatchObject({ argv: ["node", "--version"], cwd: "packages/check" });
});

it("rejects attempts to rewrite planned argv, content coordinates and probe argv", async () => {
  const input = await fixture();
  const check = CheckDeclarationSchema.parse({ checks: { example: { command: ["node", "check.cjs"], mode: "files",
    runner: true, runtime_inputs: [["node", "--version"]] } } }).checks.example!;
  const plan = await planCheckExecution({ ...input, check, globalRuntimeInputs: [["git", "--version"]] });
  const invocation = plan.invocations[0]!;
  expect(() => invocation.argv.push("rewritten")).toThrow(TypeError);
  expect(() => Object.assign(invocation.commandContent!, { tree: "f".repeat(40) })).toThrow(TypeError);
  expect(() => plan.probes.global[0]!.argv.push("rewritten")).toThrow(TypeError);
  expect(() => plan.probes.check[0]!.argv.push("rewritten")).toThrow(TypeError);
  expect(invocation.argv).toEqual(["node", "check.cjs", ...input.paths]);
  expect(invocation.commandContent!.tree).toBe("a".repeat(40));
  expect(plan.probes.global[0]!.argv).toEqual(["git", "--version"]);
  expect(plan.probes.check[0]!.argv).toEqual(["node", "--version"]);
});

it.each(["invocation", "shell", "global probe", "check probe"])("refuses invalid %s argv and plans successfully after repair", async fault => {
  const input = await fixture();
  const command = fault === "shell" ? "bad\0shell" : ["node", fault === "invocation" ? "bad\0argument" : "check.cjs"];
  const check = CheckDeclarationSchema.parse({ checks: { example: { command, shell: fault === "shell", runner: true,
    runtime_inputs: fault === "check probe" ? [[""]] : [] } } }).checks.example!;
  const globalRuntimeInputs = fault === "global probe" ? [["node", "bad\0argument"]] : [];
  await expect(planCheckExecution({ ...input, check, globalRuntimeInputs })).rejects.toThrow(/invalid.*argv.*repair.*retry/iu);
  const repaired = CheckDeclarationSchema.parse({ checks: { example: { command: ["node", "check.cjs"], runner: true } } }).checks.example!;
  expect((await planCheckExecution({ ...input, check: repaired })).invocations[0]!.argv).toEqual(["node", "check.cjs"]);
});

it.each(["lexical escape", "resolved escape", "missing directory"])("refuses a %s cwd and permits a repaired root", async fault => {
  const input = await fixture();
  if (fault === "resolved escape") await symlink(dirname(input.source.root), join(input.source.root, "escape"), "junction");
  const command = ["node", "check.cjs"];
  const root = fault === "lexical escape" ? "../outside" : fault === "resolved escape" ? "escape" : "absent";
  const check = CheckDeclarationSchema.parse({ checks: { example: { command, root, runner: true } } }).checks.example!;
  await expect(planCheckExecution({ ...input, check })).rejects.toThrow(/(?:check.root|contained directory).*repair.*retry.*local/iu);
  const repaired = CheckDeclarationSchema.parse({ checks: { example: { command, root: "packages/check", runner: true } } }).checks.example!;
  expect((await planCheckExecution({ ...input, check: repaired })).invocations[0]).toMatchObject({ cwd: "packages/check", argv: command });
});

it.each(["global", "check"] as const)("budgets complete %s probe argv before placement and accepts a shorter probe", async group => {
  const input = await fixture();
  const oversized = ["node", "x".repeat(9000)];
  const declaration = (runtime_inputs: string[][]) => CheckDeclarationSchema.parse({ checks: { example: {
    command: ["node", "check.cjs"], runner: true, runtime_inputs,
  } } }).checks.example!;
  const check = declaration(group === "check" ? [oversized] : []);
  const refusal = await planCheckExecution({ ...input, check, globalRuntimeInputs: group === "global" ? [oversized] : [] })
    .then(() => "planned", (error: unknown) => error instanceof Error ? error.message : String(error));
  expect(refusal).toMatch(/argument budget.*shorten.*retry/u);
  const repaired = declaration(group === "check" ? [["node", "--version"]] : []);
  const plan = await planCheckExecution({ ...input, check: repaired,
    globalRuntimeInputs: group === "global" ? [["node", "--version"]] : [] });
  expect(plan.probes[group][0]!.argv).toEqual(["node", "--version"]);
});

it("expands an opted-in matrix in batch/shard order with stable coordinates and fresh wire IDs", async () => {
  const paths = Array.from({ length: 20 }, (_, index) => `packages/check/src/${index}/${"&".repeat(100)}`);
  const input = await fixture(undefined, paths);
  const check = CheckDeclarationSchema.parse({ checks: { example: { command: ["check"], mode: "files",
    runner: true, shards: { count: 3, argument: "--shard={index}/{count}", routed: true } } } }).checks.example!;
  const first = await planCheckExecution({ ...input, check });
  const second = await planCheckExecution({ ...input, check });
  expect(first.coordinates).toEqual([
    { batch: 1, shard: { index: 1, count: 3 } }, { batch: 1, shard: { index: 2, count: 3 } },
    { batch: 1, shard: { index: 3, count: 3 } }, { batch: 2, shard: { index: 1, count: 3 } },
    { batch: 2, shard: { index: 2, count: 3 } }, { batch: 2, shard: { index: 3, count: 3 } },
  ]);
  expect(first.invocations.map(invocation => invocation.argv)).toEqual(second.invocations.map(invocation => invocation.argv));
  expect(first.invocations.map(invocation => invocation.id)).not.toEqual(second.invocations.map(invocation => invocation.id));
  for (let shard = 0; shard < 3; shard++) {
    const invocations = first.invocations.filter((_, index) => index % 3 === shard);
    expect(invocations.flatMap(invocation => invocation.argv.slice(1, -1))).toEqual(paths);
    expect(invocations.map(invocation => invocation.argv.at(-1))).toEqual([`--shard=${shard + 1}/3`, `--shard=${shard + 1}/3`]);
  }
});

it("reserves the final multi-digit shard argument before partitioning literal paths", async () => {
  const paths = Array.from({ length: 20 }, (_, index) => `packages/check/${index}/${'é"&'.repeat(50)}`);
  const input = await fixture(undefined, paths);
  const check = CheckDeclarationSchema.parse({ checks: { example: { command: ["check"], mode: "files",
    runner: true, shards: { count: 12, argument: `${"x".repeat(7400)}--shard={index}/{count}`, routed: true } } } }).checks.example!;
  await expect(planCheckExecution({ ...input, check })).rejects.toThrow(/argument budget.*shorten.*retry/u);
  check.shards!.argument = `${"x".repeat(7000)}--shard={index}/{count}`;
  const plan = await planCheckExecution({ ...input, check });
  for (let index = 0; index < 12; index++) {
    const invocations = plan.invocations.filter((_, ordinal) => ordinal % 12 === index);
    expect(invocations.flatMap(invocation => invocation.argv.slice(1, -1))).toEqual(paths);
    for (const invocation of invocations) {
      expect(batchPortableCheckPaths(invocation.argv, [])).toEqual([]);
      expect(invocation.argv.at(-1)).toBe(`${"x".repeat(7000)}--shard=${index + 1}/12`);
    }
  }
});

it.each(["project", "files"] as const)("budgets fixed shard overflow for %s without paths and permits a shorter argument", async mode => {
  const input = await fixture();
  const check = CheckDeclarationSchema.parse({ checks: { example: { command: ["check"], mode, ...(mode === "files" ? { pass_paths: false } : {}),
    runner: true, shards: { count: 2, argument: `${"x".repeat(8000)}{index}`, routed: true } } } }).checks.example!;
  await expect(planCheckExecution({ ...input, check })).rejects.toThrow(/argument budget.*shorten.*retry/u);
  check.shards!.argument = "--shard={index}";
  const plan = await planCheckExecution({ ...input, check });
  expect(plan.invocations.map(invocation => invocation.argv)).toEqual([["check", "--shard=1"], ["check", "--shard=2"]]);
});

it("composes shell shards as one native command string", async () => {
  const input = await fixture();
  const check = CheckDeclarationSchema.parse({ checks: { example: { command: "node check.cjs", shell: true,
    runner: true, shards: { count: 2, argument: "--shard={index}/{count}", routed: true } } } }).checks.example!;
  expect((await planCheckExecution({ ...input, check })).invocations.map(invocation => invocation.argv))
    .toEqual([["node check.cjs --shard=1/2"], ["node check.cjs --shard=2/2"]]);
});
