/** Built-CLI execution of increment-boundary checks. */
import { afterEach, expect, it } from "vitest";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc, runArcNoTty } from "./helpers.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

it("reports an absent declaration as none declared with a successful exit", async () => {
  const cwd = await createTempRepoCore({ prefix: "arc-increment-absent-" });
  repositories.push(cwd);
  const result = await runArc(["check", "increment", "--json"], cwd);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ schemaVersion: 1, result: { status: "none declared", checks: [] } });
  expect(result.stderr).toBe("");
});

it("names an invalid declaration field and succeeds after that field is repaired", async () => {
  const valid = { checks: { lint: { command: [process.execPath, "capture.cjs"], gate: "commit" } } };
  const cwd = await declaredFixture(valid.checks);
  const declaration = join(cwd, ".arc/system/arc-checks.yml");
  await writeFile(declaration, JSON.stringify({ checks: { lint: { command: 7, gate: "commit" } } }));
  const refused = await runArc(["check", "increment", "--json"], cwd);
  expect(refused.exitCode, refused.stderr).toBe(2);
  expect(JSON.parse(refused.stdout)).toMatchObject({ schemaVersion: 1, error: { kind: "invalid" } });
  expect(JSON.parse(refused.stdout).error.message).toContain("checks.lint.command");
  await writeFile(declaration, JSON.stringify(valid));
  const repaired = await runArc(["check", "increment", "--json"], cwd);
  expect(repaired.exitCode, repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout)).toMatchObject({ result: { checks: [{ id: "lint", outcome: "passed" }] } });
});

it("prints passing checks on one line and a bounded output tail for failures", async () => {
  const cwd = await declaredFixture({
    passed: { command: [process.execPath, "capture.cjs"], gate: "commit", inputs: ["src/**"] },
    failed: { command: [process.execPath, "-e", "for (let i = 0; i < 30; i++) console.error('failure-' + i); process.exit(1)"], gate: "commit", inputs: ["src/**"] },
  });
  const result = await runArcNoTty(["--no-input", "check", "increment"], cwd);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(result.stdout.split("\n").filter(line => line === "passed: passed")).toHaveLength(1);
  expect(result.stdout).toContain("failed: failed");
  expect(result.stdout).toContain("failure-29");
  expect(result.stdout).not.toContain("failure-0\n");
});

it("leaves a deletion-only files check unselected when it has no path to receive", async () => {
  const cwd = await declaredFixture({
    files: { command: [process.execPath, "capture.cjs"], gate: "commit", mode: "files", inputs: ["src/deleted.ts"] },
  });
  await rm(join(cwd, "src/deleted.ts"));
  const result = await runArc(["check", "increment", "--json"], cwd);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ result: { checks: [
    { id: "files", outcome: "not selected", reason: "no files to check" },
  ] } });
  await expect(readFile(join(cwd, "receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("reports a failed check with exit 1 and still runs the other selected checks", async () => {
  const cwd = await declaredFixture({
    failed: { command: [process.execPath, "-e", "console.error('failure detail'); process.exit(17)"], gate: "commit", inputs: ["src/**"] },
    passed: { command: [process.execPath, "capture.cjs"], gate: "commit", inputs: ["src/**"] },
  });
  const result = await runArc(["check", "increment", "--json"], cwd);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ result: { checks: [
    { id: "failed", outcome: "failed", output: "failure detail" }, { id: "passed", outcome: "passed" },
  ] } });
  expect(JSON.parse(await readFile(join(cwd, "receipt.json"), "utf8"))).toEqual({ args: [], cwd });
});

async function declaredFixture(checks: Record<string, unknown>): Promise<string> {
  const cwd = await createTempRepoCore({ prefix: "arc-increment-declared-" });
  repositories.push(cwd);
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await mkdir(join(cwd, "src"));
  await mkdir(join(cwd, "docs"));
  await writeFile(join(cwd, ".gitignore"), "receipt.json\n");
  await writeFile(join(cwd, "src/a.ts"), "base\n");
  await writeFile(join(cwd, "src/deleted.ts"), "deleted\n");
  await writeFile(join(cwd, "docs/b.md"), "base\n");
  await writeFile(join(cwd, "capture.cjs"), "require('node:fs').writeFileSync('receipt.json', JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }));\n");
  await writeFile(join(cwd, ".arc/system/arc-checks.yml"), JSON.stringify({ checks }));
  await execFileAsync("git", ["add", "-A"], { cwd });
  await execFileAsync("git", ["commit", "-m", "base"], { cwd });
  await writeFile(join(cwd, "src/a.ts"), "changed\n");
  return cwd;
}

it("runs only the commit checks reached by the change and succeeds when they pass", async () => {
  const cwd = await declaredFixture({
    selected: { command: [process.execPath, "capture.cjs"], gate: "commit", inputs: ["src/**"] },
    unchanged: { command: [process.execPath, "-e", "process.exit(1)"], gate: "commit", inputs: ["docs/**"] },
    later: { command: [process.execPath, "-e", "process.exit(1)"], gate: "push", inputs: ["src/**"] },
  });
  const result = await runArc(["check", "increment", "--json"], cwd);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ result: { status: "completed", checks: [
    { id: "selected", kind: "deadline", outcome: "passed" },
    { id: "unchanged", kind: "deadline", outcome: "not selected", reason: "inputs unchanged" },
  ] } });
  expect(JSON.parse(await readFile(join(cwd, "receipt.json"), "utf8"))).toEqual({ args: [], cwd });
});

it("passes only changed matching paths that exist to a files check", async () => {
  const cwd = await declaredFixture({
    files: { command: [process.execPath, "capture.cjs"], gate: "commit", mode: "files", inputs: ["src/**"] },
  });
  await rm(join(cwd, "src/deleted.ts"));
  await writeFile(join(cwd, "src/new.ts"), "new\n");
  await writeFile(join(cwd, "docs/b.md"), "changed outside inputs\n");
  const result = await runArc(["check", "increment", "--json"], cwd);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(await readFile(join(cwd, "receipt.json"), "utf8"))).toEqual({
    args: ["src/a.ts", "src/new.ts"], cwd,
  });
});

const countedCommand = [process.execPath, "-e", "const fs = require('node:fs'); let n = 0; try { n = Number(fs.readFileSync('receipt.json', 'utf8')); } catch {} fs.writeFileSync('receipt.json', String(n + 1)); console.log('stored summary');"];

it("reuses an unchanged pass with its stored summary without executing again", async () => {
  const cwd = await declaredFixture({ lint: { command: countedCommand, gate: "commit", inputs: ["src/**"] } });
  const first = await runArc(["check", "increment", "--json"], cwd);
  expect(first.exitCode, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout)).toMatchObject({ result: { checks: [{ outcome: "passed", output: "stored summary" }] } });
  const second = await runArc(["check", "increment", "--json"], cwd);
  expect(second.exitCode, second.stderr).toBe(0);
  expect(JSON.parse(second.stdout)).toMatchObject({ result: { checks: [{ id: "lint", outcome: "reused", output: "stored summary" }] } });
  expect(await readFile(join(cwd, "receipt.json"), "utf8")).toBe("1");
});

it("forces execution, records its pass, and bypasses a later reuse hit", async () => {
  const cwd = await declaredFixture({ lint: { command: countedCommand, gate: "commit", inputs: ["src/**"] } });
  for (const force of [true, false, true]) {
    const result = await runArc(["check", "increment", "--json", ...(force ? ["--force"] : [])], cwd);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ result: { checks: [{ outcome: force ? "passed" : "reused" }] } });
  }
  expect(await readFile(join(cwd, "receipt.json"), "utf8")).toBe("2");
});

it.each(["failed", "cache disabled"])("executes again when the prior check was %s", async condition => {
  const command = condition === "failed" ? [...countedCommand.slice(0, -1), `${countedCommand.at(-1)} process.exit(1);`] : countedCommand;
  const cwd = await declaredFixture({ lint: { command, gate: "commit", inputs: ["src/**"], cache: condition !== "cache disabled" } });
  for (let n = 0; n < 2; n++) {
    const result = await runArc(["check", "increment", "--json"], cwd);
    expect(result.exitCode, result.stderr).toBe(condition === "failed" ? 1 : 0);
    expect(JSON.parse(result.stdout)).toMatchObject({ result: { checks: [{ outcome: condition === "failed" ? "failed" : "passed" }] } });
  }
  expect(await readFile(join(cwd, "receipt.json"), "utf8")).toBe("2");
});

it("reruns when another matching input changes while the received files stay the same", async () => {
  const cwd = await declaredFixture({ lint: { command: countedCommand, gate: "commit", inputs: ["src/**"] } });
  const first = await runArc(["check", "increment", "--json"], cwd);
  expect(first.exitCode, first.stderr).toBe(0);
  await writeFile(join(cwd, "src/deleted.ts"), "new content\n");
  const second = await runArc(["check", "increment", "--json"], cwd);
  expect(second.exitCode, second.stderr).toBe(0);
  expect(JSON.parse(second.stdout)).toMatchObject({ result: { checks: [{ outcome: "passed" }] } });
  expect(await readFile(join(cwd, "receipt.json"), "utf8")).toBe("2");
});

it("keeps running when its private record directory is unavailable", async () => {
  const cwd = await declaredFixture({ lint: { command: countedCommand, gate: "commit", inputs: ["src/**"] } });
  await writeFile(join(cwd, ".git/arc-checks"), "not a directory");
  for (let n = 0; n < 2; n++) {
    const result = await runArc(["check", "increment", "--json"], cwd);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ result: { checks: [{ outcome: "passed" }] } });
  }
  expect(await readFile(join(cwd, "receipt.json"), "utf8")).toBe("2");
});
