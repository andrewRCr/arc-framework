/** Fixer output must reach the native commit or leave a failed commit intact. */
import { afterEach, expect, inject, it } from "vitest";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { commitThroughManager, createHookManagerRepository, executionReceipt } from "../fixtures/checks/hook-manager.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { git, runArc } from "./helpers.js";

const roots: string[] = [];
const format = { gate: "commit", inputs: ["src/0.txt"], fixes: true, command: [process.execPath, "-e",
  "const fs=require('node:fs');fs.writeFileSync('src/0.txt','formatted\\n');fs.appendFileSync('receipt.json','format\\n')"] };
afterEach(async () => { await removeGitBackedDirs(roots.splice(0)); });

async function prepare(declaration: Record<string, unknown> = {}): Promise<string> {
  const root = await createHookManagerRepository("core.hooksPath", inject("arcHookManagerTools"));
  roots.push(root);
  await writeFile(join(root, ".arc/system/arc-checks.yml"), JSON.stringify({ ...declaration, checks: { format } }));
  await writeFile(join(root, "src/0.txt"), "unfixed\n");
  return root;
}

async function passes(root: string): Promise<string[]> {
  return (await readdir(join(root, ".git/arc-checks")).catch(() => []))
    .filter(path => /^[a-f0-9]{64}\.json$/u.test(path));
}

it.each(["staged", "all tracked"])("restages fixer output through a native %s commit", async mode => {
  const root = await prepare();
  const validate = { gate: "commit", mode: "files", inputs: ["src/0.txt"], reads_index: true, cache: false,
    command: [process.execPath, "-e", "const fs=require('node:fs'),git=(...args)=>require('node:child_process').execFileSync('git',args,{encoding:'utf8'}).trim();fs.appendFileSync('receipt.json','validate:'+git('show',':src/0.txt')+':'+git('show',process.env.ARC_CHECK_TREE+':src/0.txt')+'\\n')"] };
  await writeFile(join(root, ".arc/system/arc-checks.yml"), JSON.stringify({ checks: { format, validate } }));
  if (mode === "staged") await git(root, ["add", "src/0.txt"]);
  const result = await commitThroughManager(root, undefined, {}, mode === "staged" ? [] : ["-a"]);
  expect(result.exitCode, result.output).toBe(0);
  expect(await git(root, ["show", "HEAD:src/0.txt"])).toBe("formatted");
  expect(await git(root, ["show", ":src/0.txt"])).toBe("formatted");
  expect(await executionReceipt(root)).toBe("format\nvalidate:formatted:formatted\n");
  expect(await passes(root)).toHaveLength(1);
}, 60_000);

it("leaves a fixer's outside rewrite unstaged and its divergent pass unrecorded", async () => {
  const root = await prepare();
  const outside = { ...format, inputs: ["src/**"], command: [process.execPath, "-e",
    "const fs=require('node:fs');fs.writeFileSync('src/0.txt','formatted\\n');fs.writeFileSync('src/1.txt','outside rewrite\\n')"] };
  await writeFile(join(root, ".arc/system/arc-checks.yml"), JSON.stringify({ checks: { format: outside } }));
  await git(root, ["add", "src/0.txt"]);
  const result = await commitThroughManager(root);
  expect(result.exitCode, result.output).toBe(0);
  expect(await git(root, ["show", "HEAD:src/0.txt"])).toBe("formatted");
  expect(await git(root, ["show", "HEAD:src/1.txt"])).toBe("base");
  expect(await readFile(join(root, "src/1.txt"), "utf8")).toBe("outside rewrite\n");
  expect(await passes(root)).toEqual([]);
}, 60_000);

it.each(["lefthook", "pre-commit"] as const)("preserves changes overlapping a fixer inside %s", async manager => {
  const root = await createHookManagerRepository(manager, inject("arcHookManagerTools"));
  roots.push(root);
  const preserve = { ...format, command: [process.execPath, "-e",
    "const fs=require('node:fs');fs.writeFileSync('src/0.txt',fs.readFileSync('src/0.txt','utf8').replace('unfixed','formatted'));fs.appendFileSync('receipt.json','format\\n')"] };
  await writeFile(join(root, ".arc/system/arc-checks.yml"), JSON.stringify({ checks: { format: preserve } }));
  await writeFile(join(root, "src/0.txt"), "unfixed\n");
  await git(root, ["add", "src/0.txt", ".arc/system/arc-checks.yml"]);
  await writeFile(join(root, "src/0.txt"), "unfixed person's set-aside edit\n");
  await writeFile(join(root, "src/1.txt"), "unrelated unstaged edit\n");
  await writeFile(join(root, "src/untracked.txt"), "untracked edit\n");
  const head = await git(root, ["rev-parse", "HEAD"]);
  const failed = await commitThroughManager(root);
  expect(failed.exitCode, failed.output).toBe(1);
  expect(await git(root, ["rev-parse", "HEAD"])).toBe(head);
  expect(await readFile(join(root, "src/0.txt"), "utf8")).toBe("unfixed person's set-aside edit\n");
  expect(await readFile(join(root, "src/1.txt"), "utf8")).toBe("unrelated unstaged edit\n");
  expect(await readFile(join(root, "src/untracked.txt"), "utf8")).toBe("untracked edit\n");
  expect(await git(root, ["show", ":src/0.txt"])).toBe("unfixed");
  expect(await passes(root)).toEqual([]);
  await writeFile(join(root, "src/0.txt"), "formatted person's set-aside edit\n");
  await git(root, ["add", "src/0.txt"]);
  const repaired = await commitThroughManager(root);
  expect(repaired.exitCode, repaired.output).toBe(0);
  expect(await git(root, ["show", "HEAD:src/0.txt"])).toBe("formatted person's set-aside edit");
  expect(await readFile(join(root, "src/1.txt"), "utf8")).toBe("unrelated unstaged edit\n");
  expect(await readFile(join(root, "src/untracked.txt"), "utf8")).toBe("untracked edit\n");
}, 60_000);

it("records fixer output rather than reusing it for later unfixed content", async () => {
  const root = await prepare();
  await git(root, ["add", "src/0.txt"]);
  const first = await commitThroughManager(root);
  expect(first.exitCode, first.output).toBe(0);
  await writeFile(join(root, "src/0.txt"), "unfixed\n");
  await git(root, ["add", "src/0.txt"]);
  const second = await commitThroughManager(root);
  expect(second.exitCode, second.output).toBe(0);
  expect(await executionReceipt(root)).toBe("format\nformat\n");
  expect(await git(root, ["show", "HEAD:src/0.txt"])).toBe("formatted");
}, 60_000);

it("invalidates a later fixer's earlier pass and exposes the restaged index at its turn", async () => {
  const root = await prepare();
  const second = { ...format, mode: "files", reads_index: true, command: [process.execPath, "-e",
    "const fs=require('node:fs'),git=(...args)=>require('node:child_process').execFileSync('git',args,{encoding:'utf8'}).trim();fs.appendFileSync('receipt.json',JSON.stringify({index:git('show',':src/0.txt'),content:git('show',process.env.ARC_CHECK_TREE+':src/0.txt'),tree:git('write-tree'),turn:process.env.ARC_CHECK_TREE})+'\\n')"] };
  await writeFile(join(root, ".arc/system/arc-checks.yml"), JSON.stringify({ checks: { format, second } }));
  await git(root, ["add", "src/0.txt"]);
  const primed = await runArc(["check", "pre-commit", "--json"], root, { env: { ARC_SKIP: "format" } });
  expect(JSON.parse(primed.stdout).result.checks[1].outcome).toBe("passed");
  expect(primed.exitCode, primed.stderr).toBe(0);
  const result = await commitThroughManager(root);
  expect(result.exitCode, result.output).toBe(0);
  const receipts = (await executionReceipt(root)).trim().split("\n");
  expect(receipts).toHaveLength(3);
  const observed = JSON.parse(receipts[2] ?? "{}");
  expect(observed).toMatchObject({ index: "formatted", content: "formatted" });
  expect(observed.tree).toBe(observed.turn);
}, 60_000);

it("fails rewrites by declaration and reruns after the rewrite is discarded", async () => {
  const root = await prepare({ commit_fixes: "fail" });
  await git(root, ["add", "src/0.txt"]);
  const head = await git(root, ["rev-parse", "HEAD"]);
  for (let attempt = 0; attempt < 2; attempt++) {
    await writeFile(join(root, "src/0.txt"), "unfixed\n");
    const result = await commitThroughManager(root);
    expect(result.exitCode, result.output).toBe(1);
    expect(result.output).toContain("rewrote files");
    expect(await git(root, ["rev-parse", "HEAD"])).toBe(head);
    expect(await readFile(join(root, "src/0.txt"), "utf8")).toBe("formatted\n");
    expect(await git(root, ["show", ":src/0.txt"])).toBe("unfixed");
    expect(await passes(root)).toEqual([]);
  }
  expect(await executionReceipt(root)).toBe("format\nformat\n");
  await git(root, ["add", "src/0.txt"]);
  const repaired = await commitThroughManager(root);
  expect(repaired.exitCode, repaired.output).toBe(0);
  expect(await passes(root)).toHaveLength(1);
}, 60_000);

it.each(["pre-commit environment", "lefthook detection", "path-limited index"])(
  "treats restage as fail for %s and resumes after whole-file staging", async boundary => {
    const root = await prepare();
    if (boundary === "lefthook detection") await writeFile(join(root, "lefthook.yml"), "{}\n");
    if (boundary !== "path-limited index") await git(root, ["add", "src/0.txt"]);
    const head = await git(root, ["rev-parse", "HEAD"]);
    const environment = boundary === "pre-commit environment" ? { PRE_COMMIT: "1" } : {};
    const args = boundary === "path-limited index" ? ["--", "src/0.txt"] : [];
    const result = await commitThroughManager(root, undefined, environment, args);
    expect(result.exitCode, result.output).toBe(1);
    expect(await git(root, ["rev-parse", "HEAD"])).toBe(head);
    expect(await readFile(join(root, "src/0.txt"), "utf8")).toBe("formatted\n");
    expect(await git(root, ["show", ":src/0.txt"])).toBe(boundary === "path-limited index" ? "base" : "unfixed");
    expect(await passes(root)).toEqual([]);
    await git(root, ["add", "src/0.txt"]);
    const repaired = await commitThroughManager(root, undefined, environment);
    expect(repaired.exitCode, repaired.output).toBe(0);
    expect(await git(root, ["show", "HEAD:src/0.txt"])).toBe("formatted");
  }, 60_000);

it("fails the hook when restaging cannot acquire its index and resumes after repair", async () => {
  const root = await prepare();
  const blocking = { ...format, command: [process.execPath, "-e",
    "const fs=require('node:fs');fs.writeFileSync('src/0.txt','formatted\\n');fs.writeFileSync('.git/index.lock','held')"] };
  await writeFile(join(root, ".arc/system/arc-checks.yml"), JSON.stringify({ checks: { format: blocking } }));
  await git(root, ["add", "src/0.txt"]);
  const head = await git(root, ["rev-parse", "HEAD"]);
  const result = await commitThroughManager(root);
  expect(result.exitCode, result.output).toBe(1);
  expect(result.output).toContain("Could not restage fixer rewrites");
  expect(result.output).toContain("retry git commit");
  expect(await git(root, ["rev-parse", "HEAD"])).toBe(head);
  expect(await readFile(join(root, "src/0.txt"), "utf8")).toBe("formatted\n");
  expect(await passes(root)).toEqual([]);
  await rm(join(root, ".git/index.lock"));
  await writeFile(join(root, ".arc/system/arc-checks.yml"), JSON.stringify({ checks: { format } }));
  await git(root, ["add", "src/0.txt"]);
  const repaired = await commitThroughManager(root);
  expect(repaired.exitCode, repaired.output).toBe(0);
  expect(await git(root, ["show", "HEAD:src/0.txt"])).toBe("formatted");
}, 60_000);
