/** Native CI invocations consume forecast batches in their own checkout. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
