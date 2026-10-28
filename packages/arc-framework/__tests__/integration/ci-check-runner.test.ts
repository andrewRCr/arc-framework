/** Native CI invocations consume forecast batches in their own checkout. */
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { gitExec } from "../../src/lib/io-context.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { resolveCheckForecast } from "../../src/lib/checks/forecast.js";
import { runCiCheckStep } from "../../src/lib/ci-check-runner.js";

const roots: string[] = [];
beforeEach(() => { vi.stubEnv("FORCE_COLOR", undefined); });
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

it("resolves a relative working directory against the consuming checkout", async () => {
  const setup = await fixture();
  const nested = join(setup.root, "nested");
  await mkdir(nested);
  const declaration = CheckDeclarationSchema.parse({ checks: { other: {
    command: [process.execPath, "../probe.mjs", "relative"], root: "nested",
  } } });
  const check = declaration.checks.other!;
  const forecast = { ...setup.forecast, checks: [{ id: "other",
    ...resolveCheckForecast(check, setup.root, [], process.platform) }] };
  expect(await runCiCheckStep({ ...setup, declaration, forecast, step: "default" })).toBe(0);
  expect(await output(nested)).toEqual([["relative"]]);
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "arc-ci-runner-"));
  roots.push(root);
  await writeFile(join(root, "probe.mjs"), 'import fs from "node:fs"; fs.appendFileSync("output.jsonl", JSON.stringify(process.argv.slice(2))+"\\n");\n');
  for (const args of [["init", "-b", "main"], ["add", "-A"],
    ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-qm", "fixture"]]) {
    await gitExec("git", args, { cwd: root });
  }
  const tree = (await gitExec("git", ["rev-parse", "HEAD^{tree}"], { cwd: root })).stdout;
  const base = (await gitExec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout;
  const declaration = CheckDeclarationSchema.parse({ checks: {
    selected: { command: [process.execPath, "probe.mjs", "selected"], shards: { count: 2, argument: "--shard={index}/{count}" } },
    other: { command: [process.execPath, "probe.mjs", "other"] },
  } });
  const checks = Object.entries(declaration.checks).map(([id, check]) => ({ id,
    ...resolveCheckForecast(check, root, [], process.platform) }));
  return { root, declaration, forecast: { tree, base, checks },
    plumbing: { selected: [{ job: "unit", step: "test" }] }, job: "unit", step: "test" };
}

async function output(root: string) {
  const text = await readFile(join(root, "output.jsonl"), "utf8").catch(() => "");
  return text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as string[]);
}

it("runs only the mapped check's given shard and appends workflow reporting arguments", async () => {
  const setup = await fixture();
  expect(await runCiCheckStep({ ...setup, shard: 2, arguments: ["--reporter=json"] })).toBe(0);
  expect(await output(setup.root)).toEqual([["selected", "--shard=2/2", "--reporter=json"]]);
});

it("runs every unmapped entry at the default step", async () => {
  const setup = await fixture();
  expect(await runCiCheckStep({ ...setup, job: "lint", step: "default" })).toBe(0);
  expect(await output(setup.root)).toEqual([["other"]]);
});

it("runs a new unmapped sharded entry without requiring a workflow matrix", async () => {
  const setup = await fixture();
  await expect(runCiCheckStep({ ...setup, plumbing: {}, job: "lint", step: "default" })).resolves.toBe(0);
  expect(await output(setup.root)).toEqual([["selected"], ["other"]]);
});

it("exports file-check coordinates and an index equal to the forecast tree", async () => {
  const setup = await fixture();
  await writeFile(join(setup.root, "coordinates.mjs"),
    'import fs from "node:fs"; import {execFileSync} from "node:child_process"; '
    + 'fs.writeFileSync("coordinates.json",JSON.stringify({base:process.env.ARC_CHECK_BASE, '
    + 'tree:process.env.ARC_CHECK_TREE,merged:process.env.ARC_CHECK_MERGED, '
    + 'index:execFileSync("git",["write-tree"],{encoding:"utf8"}).trim()}));\n');
  const declaration = CheckDeclarationSchema.parse({ checks: { other: {
    command: [process.execPath, "coordinates.mjs"], mode: "files", reads_index: true,
  } } });
  const forecast = { ...setup.forecast, merged: [setup.forecast.base], checks: [{ id: "other",
    ...resolveCheckForecast(declaration.checks.other!, setup.root, ["coordinates.mjs"], process.platform) }] };
  await gitExec("git", ["add", "coordinates.mjs"], { cwd: setup.root });
  vi.stubEnv("ARC_CHECK_BASE", "stale");
  vi.stubEnv("ARC_CHECK_TREE", "stale");
  vi.stubEnv("ARC_CHECK_MERGED", "stale");
  vi.stubEnv("GIT_DIR", "/poisoned/repository");
  expect(await runCiCheckStep({ ...setup, declaration, forecast, step: "default" })).toBe(0);
  const actual = JSON.parse(await readFile(join(setup.root, "coordinates.json"), "utf8").catch(() => "{}"));
  expect(actual).toEqual({ base: forecast.base, tree: forecast.tree, merged: forecast.base, index: forecast.tree });
});

it("fails when a fix-capable verification rewrites tracked content", async () => {
  const setup = await fixture();
  const declaration = CheckDeclarationSchema.parse({ checks: { other: {
    command: [process.execPath, "-e", 'require("node:fs").writeFileSync("probe.mjs","rewritten\\n")'], fixes: true,
  } } });
  const forecast = { ...setup.forecast, checks: [{ id: "other",
    ...resolveCheckForecast(declaration.checks.other!, setup.root, [], process.platform) }] };
  expect(await runCiCheckStep({ ...setup, declaration, forecast, step: "default" })).toBe(1);
  expect(await readFile(join(setup.root, "probe.mjs"), "utf8")).toBe("rewritten\n");
});


it("executes an explicitly mapped default-step check and propagates its failure", async () => {
  const setup = await fixture();
  const declaration = CheckDeclarationSchema.parse({ checks: {
    broken: { command: [process.execPath, "-e", "process.exit(17)"] },
  } });
  const forecast = { ...setup.forecast, checks: [{ id: "broken",
    ...resolveCheckForecast(declaration.checks.broken!, setup.root, [], process.platform) }] };
  expect(await runCiCheckStep({ ...setup, declaration, forecast,
    plumbing: { broken: [{ job: "unit", step: "default" }] }, step: "default" })).toBe(1);
});

it.each(["changed", "added", "removed", "missing", "constructor"])("refuses %s selected input declarations until the forecast is regenerated", async change => {
  const setup = await fixture();
  vi.stubEnv("CHECK_MODE", undefined);
  vi.stubEnv("CHECK_EXTRA", undefined);
  const id = change === "constructor" ? "constructor" : "selected";
  const original = CheckDeclarationSchema.parse({ checks: { [id]: {
    command: [process.execPath, "probe.mjs", "repaired"], environment_inputs: { CHECK_MODE: "value" },
  } } });
  const currentInputs = change === "changed" ? { CHECK_MODE: "file" }
    : change === "added" ? { CHECK_MODE: "value", CHECK_EXTRA: "file" } : {};
  const declaration = CheckDeclarationSchema.parse({ checks: change === "missing" || change === "constructor" ? {} : {
    [id]: { ...original.checks[id], environment_inputs: currentInputs },
  } });
  const forecast = { ...setup.forecast, checks: [{ id,
    ...resolveCheckForecast(original.checks[id]!, setup.root, [], process.platform) }] };
  const options = { ...setup, declaration, forecast, plumbing: { [id]: [{ job: "unit", step: "test" }] } };
  await expect(runCiCheckStep(options)).rejects.toThrow(/regenerate.*arc check gate merge --ci --dry-run --json/iu);
  expect(await output(setup.root)).toEqual([]);
  const repaired = change === "missing" || change === "constructor" ? original : declaration;
  const regenerated = { ...forecast, checks: [{ id,
    ...resolveCheckForecast(repaired.checks[id]!, setup.root, [], process.platform) }] };
  expect(await runCiCheckStep({ ...options, declaration: repaired, forecast: regenerated })).toBe(0);
  expect(await output(setup.root)).toEqual([["repaired"]]);
});

it("captures delivered CI artifacts once for all native batches after forecasting", async () => {
  const setup = await fixture();
  const cwd = join(setup.root, "nested");
  await mkdir(cwd);
  await writeFile(join(setup.root, "capture.mjs"), 'import fs from "node:fs"; '
    + 'const env=process.env; const bytes=fs.readFileSync(env.CHECK_WEIGHTS,"utf8"); '
    + 'fs.appendFileSync("output.jsonl",JSON.stringify({path:env.CHECK_WEIGHTS,bytes,mode:env.CHECK_MODE, '
    + 'emptyValue:env.CHECK_EMPTY_VALUE,emptyFile:env.CHECK_EMPTY_FILE, '
    + 'absent:Object.hasOwn(env,"CHECK_ABSENT"),args:process.argv.slice(2)})+"\\n"); '
    + 'fs.writeFileSync("private-input","changed by a batch");\n');
  const declaration = CheckDeclarationSchema.parse({ checks: { other: {
    command: [process.execPath, "../capture.mjs"], root: "nested", mode: "files", runner: true,
    environment_inputs: { CHECK_WEIGHTS: "file", CHECK_MODE: "value", CHECK_EMPTY_VALUE: "value",
      CHECK_EMPTY_FILE: "file", CHECK_ABSENT: "value" },
  } } });
  vi.stubEnv("CHECK_WEIGHTS", "private-input");
  vi.stubEnv("CHECK_MODE", "before delivery");
  vi.stubEnv("CHECK_EMPTY_VALUE", "");
  vi.stubEnv("CHECK_EMPTY_FILE", "");
  vi.stubEnv("CHECK_ABSENT", undefined);
  const paths = Array.from({ length: 450 }, (_, index) => `nested/${index}-${"x".repeat(80)}.ts`);
  const forecast = { ...setup.forecast, checks: [{ id: "other",
    ...resolveCheckForecast(declaration.checks.other!, setup.root, paths, process.platform) }] };
  expect(forecast.checks[0]!.batches.length).toBeGreaterThan(1);
  await writeFile(join(cwd, "private-input"), "delivered bytes");
  vi.stubEnv("CHECK_MODE", "execution step");
  expect(await runCiCheckStep({ ...setup, declaration, forecast, step: "default" })).toBe(0);
  const records = (await readFile(join(cwd, "output.jsonl"), "utf8")).trim().split("\n")
    .map(line => JSON.parse(line) as { path: string; bytes: string; mode: string; emptyValue: string;
      emptyFile: string; absent: boolean; args: string[] });
  expect(records).toHaveLength(forecast.checks[0]!.batches.length);
  expect(new Set(records.map(record => record.path)).size).toBe(1);
  expect(records[0]!.path).not.toBe("private-input");
  for (const record of records) {
    expect(record).toMatchObject({ bytes: "delivered bytes", mode: "execution step", emptyValue: "", emptyFile: "", absent: false });
    await expect(readFile(record.path)).rejects.toMatchObject({ code: "ENOENT" });
  }
  expect(records.flatMap(record => record.args)).toEqual(paths.map(path => path.slice("nested/".length)));
  expect(await readFile(join(cwd, "private-input"), "utf8")).toBe("changed by a batch");
});

it.each(["missing", "directory"])("refuses a %s CI file input before execution and runs after repair", async kind => {
  const setup = await fixture();
  const source = join(setup.root, "private-artifact-location");
  if (kind === "directory") await mkdir(source);
  vi.stubEnv("CHECK_WEIGHTS", source);
  const declaration = CheckDeclarationSchema.parse({ checks: { other: {
    command: [process.execPath, "probe.mjs", "repaired"], runner: true, environment_inputs: { CHECK_WEIGHTS: "file" },
  } } });
  const forecast = { ...setup.forecast, checks: [{ id: "other",
    ...resolveCheckForecast(declaration.checks.other!, setup.root, [], process.platform) }] };
  const options = { ...setup, declaration, forecast, step: "default" };
  await expect(runCiCheckStep(options)).rejects.toThrow(/capture.*CHECK_WEIGHTS.*repair.*retry/iu);
  try { await runCiCheckStep(options); } catch (error) {
    expect(String(error)).not.toContain(source);
  }
  expect(await output(setup.root)).toEqual([]);
  await rm(source, { recursive: true, force: true });
  await writeFile(source, "delivered after repair");
  expect(await runCiCheckStep(options)).toBe(0);
  expect(await output(setup.root)).toEqual([["repaired"]]);
});

it("preserves a failed CI command's status and disposes its frozen input", async () => {
  const setup = await fixture();
  const source = join(setup.root, "private-input");
  await writeFile(source, "original");
  vi.stubEnv("CHECK_WEIGHTS", source);
  const declaration = CheckDeclarationSchema.parse({ checks: { other: {
    command: [process.execPath, "-e", "require('node:fs').writeFileSync('copy-path',process.env.CHECK_WEIGHTS);process.exit(17)"],
    environment_inputs: { CHECK_WEIGHTS: "file" },
  } } });
  const forecast = { ...setup.forecast, checks: [{ id: "other",
    ...resolveCheckForecast(declaration.checks.other!, setup.root, [], process.platform) }] };
  expect(await runCiCheckStep({ ...setup, declaration, forecast, step: "default" })).toBe(1);
  const copied = await readFile(join(setup.root, "copy-path"), "utf8");
  try {
    expect(copied).not.toBe(source);
    await expect(readFile(copied)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(source, "utf8")).toBe("original");
  } finally {
    if (copied !== source) await rm(dirname(copied), { recursive: true, force: true });
  }
});

it("does not capture a CI file binding when the selected forecast has no batches", async () => {
  const setup = await fixture();
  vi.stubEnv("CHECK_WEIGHTS", "private-unavailable-input");
  const declaration = CheckDeclarationSchema.parse({ checks: { other: {
    command: [process.execPath, "probe.mjs", "unused"], mode: "files", environment_inputs: { CHECK_WEIGHTS: "file" },
  } } });
  const forecast = { ...setup.forecast, checks: [{ id: "other",
    ...resolveCheckForecast(declaration.checks.other!, setup.root, [], process.platform) }] };
  expect(forecast.checks[0]!.batches).toEqual([]);
  expect(await runCiCheckStep({ ...setup, declaration, forecast, step: "default" })).toBe(0);
  expect(await output(setup.root)).toEqual([]);
});

it("disposes captured CI inputs when native snapshot preparation fails before the command", async () => {
  const setup = await fixture();
  const storage = join(setup.root, "temporary-storage");
  await mkdir(storage);
  for (const name of ["TMPDIR", "TMP", "TEMP"]) vi.stubEnv(name, storage);
  const source = join(setup.root, "private-input");
  await writeFile(source, "original");
  vi.stubEnv("CHECK_WEIGHTS", source);
  const declaration = CheckDeclarationSchema.parse({ checks: { other: {
    command: [process.execPath, "probe.mjs", "unused"], fixes: true, environment_inputs: { CHECK_WEIGHTS: "file" },
  } } });
  const forecast = { ...setup.forecast, checks: [{ id: "other",
    ...resolveCheckForecast(declaration.checks.other!, setup.root, [], process.platform) }] };
  await rm(join(setup.root, ".git"), { recursive: true, force: true });
  await expect(runCiCheckStep({ ...setup, declaration, forecast, step: "default" })).rejects.toThrow();
  expect(await readdir(storage)).toEqual([]);
  expect(await output(setup.root)).toEqual([]);
  expect(await readFile(source, "utf8")).toBe("original");
});
