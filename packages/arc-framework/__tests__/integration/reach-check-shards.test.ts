/** The store check divided among shards: every selected suite in exactly one, and a change reaching none runs none. */
import { execa } from "execa";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createReachFiles, readReachDeclaration, runReachCheck } from "../../src/lib/reach-check.js";
import { selectReachSuites, type ReachDeclaration } from "../../src/lib/vitest-reach.js";
import { scriptGitExec } from "../helpers/git-exec-fake.js";

const packageRoot = resolve(import.meta.dirname, "../..");
const checkoutRoot = resolve(packageRoot, "../..");
const declarationPath = "packages/arc-framework/__tests__/reach/store-suites.json";
const shards = ["1/4", "2/4", "3/4", "4/4"];

let declaration: ReachDeclaration;
let scratch: string;
let script: string;
beforeAll(async () => {
  declaration = await readReachDeclaration(join(checkoutRoot, declarationPath));
  scratch = await mkdtemp(join(tmpdir(), "arc-reach-shards-"));
  script = join(scratch, "shards.mts");
  const module = (path: string) => JSON.stringify(pathToFileURL(join(packageRoot, path)).href);
  await writeFile(script, `
import { relative } from "node:path";
import { discoverReachSuites, readReachDeclaration, runReachSuites, shardReachSuites } from ${module("src/lib/reach-check.ts")};
import { closeVitestController } from ${module("src/lib/vitest-closing.ts")};
const [mode, checkoutRoot, declarationPath, suitesText, ...shards] = process.argv.slice(2);
const declaration = await readReachDeclaration(checkoutRoot + "/" + declarationPath);
const suites = JSON.parse(suitesText);
const runs = [];
for (const shard of shards) {
  const input = { checkoutRoot, packageRoot: process.cwd(), declaration, arguments: ["--shard=" + shard], env: process.env };
  if (mode === "run") { await runReachSuites(input, suites); continue; }
  const selection = await discoverReachSuites(input, suites);
  try {
    const held = await shardReachSuites(selection);
    runs.push({ shard, passWithNoTests: selection.controller.config.passWithNoTests,
      held: held.map(spec => relative(checkoutRoot, spec.moduleId).replaceAll("\\\\", "/")) });
  } finally { await closeVitestController(selection.controller); }
}
if (mode !== "run") console.log("SHARDS:" + JSON.stringify(runs));
`);
});
afterAll(async () => { await rm(scratch, { recursive: true, force: true }); });

async function shardScript(mode: "partition" | "run", suites: readonly string[], selected: readonly string[]) {
  const env = { ...process.env, ARC_TEST_DURATION_FILE: undefined, ARC_STORE_CHECK: undefined, ARC_CHECK_NOTICE: undefined };
  return await execa(process.execPath, ["--import", "tsx", script, mode, checkoutRoot, declarationPath,
    JSON.stringify(suites), ...selected], { cwd: packageRoot, env, reject: false, timeout: 120_000 });
}

async function partition(suites: readonly string[]): Promise<Array<{ shard: string; passWithNoTests: boolean; held: string[] }>> {
  const result = await shardScript("partition", suites, shards);
  expect(result.exitCode, result.stderr).toBe(0);
  const line = result.stdout.split("\n").find(entry => entry.startsWith("SHARDS:"));
  return JSON.parse(line?.slice("SHARDS:".length) ?? "[]");
}

function everySuite(): string[] {
  return [...selectReachSuites(declaration, createReachFiles(checkoutRoot),
    { form: "every", changed: [], environment: {} }).suites];
}

it("puts every selected store suite in exactly one of four shards, each holding some", async () => {
  const suites = everySuite();
  const runs = await partition(suites);
  const held = runs.flatMap(run => run.held);
  expect(held.length).toBe(suites.length);
  expect([...held].sort()).toEqual([...suites].sort());
  for (const run of runs) expect(run.held.length, run.shard).toBeGreaterThan(0);
}, 180_000);

it("passes a shard holding none of a small selection on its report, without running anything", async () => {
  const suites = everySuite().slice(0, 2);
  const runs = await partition(suites);
  expect(runs.flatMap(run => run.held).sort()).toEqual([...suites].sort());
  expect(runs.map(run => run.held.length).sort()).toEqual([0, 0, 1, 1]);
  for (const run of runs) expect(run.passWithNoTests, run.shard).toBe(true);
  const empty = runs.find(run => run.held.length === 0)!.shard;
  const result = await shardScript("run", suites, [empty]);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stdout).toContain(`store suites: shard ${empty.replace("/", " of ")} holds none of the 2 selected suites`);
  expect(result.stdout).not.toMatch(/Test Files|store-ref-/u);
}, 180_000);

it("runs no suite in any shard for a change reaching none", async () => {
  const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    for (const shard of shards) {
      output.mockClear();
      const { exec } = scriptGitExec([{ match: { prefix: ["diff", "--name-only"] },
        responses: [{ stdout: "docs/notes.md\0", stderr: "" }] }]);
      await runReachCheck({ checkoutRoot, packageRoot, declarationPath, declaration, arguments: [`--shard=${shard}`],
        env: { ARC_CHECK_BASE: "base", ARC_CHECK_TREE: "tree" }, git: exec });
      const report = output.mock.calls.map(([text]) => String(text)).join("");
      expect(report).toMatch(/^store suites: the change reaches none of \d+ suites\n/u);
      expect(report).not.toMatch(/^selected: |\bshard\b/mu);
    }
  } finally { output.mockRestore(); }
}, 60_000);
