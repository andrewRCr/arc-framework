/** Machine-readable check requests remain usable before execution and after input repair. */
import { afterEach, expect, it } from "vitest";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

it.each([
  ["check", "run", "check", "--unknown", "--json"],
  ["check", "run", "check", "--staged", "--all", "--json"],
  ["check", "gate", "unknown", "--json"],
  ["check", "gate", "--json"],
  ["check", "pre-commit", "--ci", "--json"],
  ["check", "new-head", "--json"],
].map(args => ({ args })))("returns a usage envelope and supports repair for $args", async ({ args }) => {
  const root = await createDeclaredCheckRepository({});
  repositories.push(root);
  const malformed = await runArc(args, root);
  expect(malformed.exitCode, malformed.stderr).toBe(2);
  expect(malformed.stdout.trim()).not.toBe("");
  expect(JSON.parse(malformed.stdout)).toMatchObject({ schemaVersion: 1,
    error: { kind: "usage", code: expect.any(String), message: expect.any(String) },
  });
  expect(malformed.stderr).toBe("");
  const repaired = await runArc(["check", "gate", "commit", "--json"], root);
  expect(repaired.exitCode, repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout)).toMatchObject({ schemaVersion: 1, result: { status: "none declared" } });
});

it("shows the last measured cost and evaluates runtime inputs without executing a forced forecast", async () => {
  const root = await createDeclaredCheckRepository({ check: {
    gate: "merge", command: [process.execPath, "-e", "require('node:fs').appendFileSync('receipt.json','check\\n')"],
    runtime_inputs: [[process.execPath, "-e", "require('node:fs').appendFileSync('receipt.json','runtime\\n');console.log('fingerprint')"]],
  } });
  repositories.push(root);
  const actual = await runArc(["check", "gate", "merge", "--json"], root);
  expect(actual.exitCode, actual.stderr).toBe(0);
  const cost = JSON.parse(actual.stdout).result.checks[0].costMs;
  expect(cost).toEqual(expect.any(Number));
  const forecast = await runArc(["check", "gate", "merge", "--force", "--dry-run", "--json"], root);
  expect(forecast.exitCode, forecast.stderr).toBe(0);
  expect(JSON.parse(forecast.stdout).result.checks[0]).toMatchObject({ outcome: "would run", lastCostMs: cost });
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("runtime\ncheck\nruntime\n");
});

it("forecasts reuse and explains unchanged checks while retaining every gate member", async () => {
  const command = [process.execPath, "-e", "require('node:fs').appendFileSync('receipt.json','run\\n')"];
  const root = await createDeclaredCheckRepository({
    source: { gate: "commit", inputs: ["src/**"], command },
    documentation: { gate: "commit", inputs: ["docs/**"], command },
  });
  repositories.push(root);
  const actual = await runArc(["check", "run", "source", "documentation", "--json"], root);
  expect(actual.exitCode, actual.stderr).toBe(0);
  const measured = JSON.parse(actual.stdout).result.checks;
  const forecast = await runArc(["check", "gate", "commit", "--changed", "--dry-run", "--json"], root);
  expect(forecast.exitCode, forecast.stderr).toBe(0);
  expect(JSON.parse(forecast.stdout).result.checks).toMatchObject([
    { id: "source", outcome: "reused", lastCostMs: measured[0].costMs },
    { id: "documentation", outcome: "not selected", reason: "inputs unchanged", lastCostMs: measured[1].costMs },
  ]);
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("run\nrun\n");
});

it("lists working directories, literal batches, flags, and shard invocations for every gate member", async () => {
  const root = await createDeclaredCheckRepository({
    format: { gate: "commit", root: "tools", mode: "files", inputs: ["src/**"], fixes: true,
      command: [process.execPath, "../capture.cjs"], shards: { count: 2, argument: "--shard={index}/{count}" } },
    project: { gate: "merge", ci_only: true, command: [process.execPath, "capture.cjs"],
      shards: { count: 3, argument: "--project={index}/{count}" } },
    shell: { gate: "push", shell: true, command: "echo shell" },
  });
  repositories.push(root);
  await mkdir(join(root, "tools"));
  await writeFile(join(root, "tools/.keep"), "");
  await writeFile(join(root, "src/space name.ts"), "literal path\n");
  const batch = [process.execPath, "../capture.cjs", "../src/a.ts", "../src/deleted.ts", "../src/space name.ts"];
  const local = await runArc(["check", "gate", "merge", "--dry-run", "--json"], root);
  expect(local.exitCode, local.stderr).toBe(0);
  const checks = JSON.parse(local.stdout).result.checks;
  expect(checks).toMatchObject([
    { id: "format", outcome: "would run", cwd: "tools", mode: "files", shell: false, ciOnly: false, fixes: true,
      batches: [batch], shards: [
        { index: 1, batches: [[...batch, "--shard=1/2"]] },
        { index: 2, batches: [[...batch, "--shard=2/2"]] },
      ] },
    { id: "project", outcome: "not selected", reason: "CI-only check requires --ci", cwd: ".", mode: "project",
      shell: false, ciOnly: true, fixes: false, batches: [[process.execPath, "capture.cjs"]],
      shards: [1, 2, 3].map(index => ({ index, batches: [[process.execPath, "capture.cjs", `--project=${index}/3`]] })) },
    { id: "shell", outcome: "would run", cwd: ".", mode: "project", shell: true, ciOnly: false, fixes: false,
      batches: [["echo shell"]] },
  ]);
  const ci = await runArc(["check", "gate", "merge", "--ci", "--dry-run", "--json"], root);
  expect(ci.exitCode, ci.stderr).toBe(0);
  expect(JSON.parse(ci.stdout).result.checks.map((check: { id: string; outcome: string }) => [check.id, check.outcome]))
    .toEqual([["format", "would run"], ["project", "would run"], ["shell", "would run"]]);
  await expect(access(join(root, "receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(access(join(root, "tools/receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
  const actual = await runArc(["check", "gate", "merge", "--ci", "--json"], root);
  expect(actual.exitCode, actual.stderr).toBe(0);
  expect(JSON.parse(actual.stdout).result.checks.map((check: { id: string; outcome: string }) => [check.id, check.outcome]))
    .toEqual([["format", "passed"], ["project", "passed"], ["shell", "passed"]]);
});

it("forecasts later fixer reuse on unchanged content even when an earlier fixer would run", async () => {
  const root = await createDeclaredCheckRepository({
    first: { gate: "commit", fixes: true, inputs: ["src/**"], command: [process.execPath, "-e",
      "const fs=require('node:fs');fs.writeFileSync('src/a.ts','formatted\\n');fs.appendFileSync('receipt.json','first\\n')"] },
    second: { gate: "commit", fixes: true, inputs: ["src/**"], command: [process.execPath, "-e",
      "const fs=require('node:fs');fs.appendFileSync('receipt.json','second\\n');console.log(fs.readFileSync('src/a.ts','utf8'))"] },
  });
  repositories.push(root);
  const warm = await runArc(["check", "run", "second", "--json"], root);
  expect(warm.exitCode, warm.stderr).toBe(0);
  const forecast = await runArc(["check", "increment", "--dry-run", "--json"], root);
  expect(forecast.exitCode, forecast.stderr).toBe(0);
  expect(JSON.parse(forecast.stdout).result.checks).toMatchObject([
    { id: "first", outcome: "would run" }, { id: "second", outcome: "reused" },
  ]);
  expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe("changed\n");
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("second\n");
  const actual = await runArc(["check", "increment", "--json"], root);
  expect(actual.exitCode, actual.stderr).toBe(0);
  expect(JSON.parse(actual.stdout).result.checks).toMatchObject([
    { id: "first", outcome: "passed" }, { id: "second", outcome: "passed", output: expect.stringContaining("formatted") },
  ]);
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("second\nfirst\nsecond\n");
});
