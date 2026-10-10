/** Fixers report their edits and record only the content they actually produce. */
import { afterEach, expect, it } from "vitest";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const repositories: string[] = [];
const git = promisify(execFile);
const command = [process.execPath, "-e", "require('node:fs').writeFileSync('src/a.ts','formatted\\n')"];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

it.each([
  ["increment"], ["segment"], ["run", "format"], ["gate", "merge", "--paths", "src/a.ts"],
].map(form => ({ form })))("applies and lists a fixer's edits under $form", async ({ form }) => {
  const root = await createDeclaredCheckRepository({ format: {
    command, gate: "commit", mode: "files", inputs: ["src/a.ts"], fixes: true, cache: false,
  } });
  repositories.push(root);
  const result = await runArc(["check", ...form, "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks[0]).toMatchObject({ outcome: "passed", rewritten: ["src/a.ts"] });
  expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe("formatted\n");
});

it.each([
  ["gate", "commit", "--changed"], ["gate", "push", "--range"], ["gate", "merge", "--all"],
  ["new-head", "--from", "HEAD"], ["increment", "--ci"], ["segment", "--ci"],
  ["run", "format", "--ci"], ["gate", "merge", "--paths", "src/a.ts", "--ci"],
].map(form => ({ form })))("fails a rewrite under $form and leaves it in the worktree", async ({ form }) => {
  const root = await createDeclaredCheckRepository({ format: {
    command, gate: "commit", mode: "files", inputs: ["src/a.ts"], fixes: true, cache: false,
  } });
  repositories.push(root);
  const result = await runArc(["check", ...form, "--json"], root);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(JSON.parse(result.stdout).result.checks[0]).toMatchObject({ outcome: "failed", rewritten: ["src/a.ts"] });
  expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe("formatted\n");
});

it("reuses passes recorded over fixer output at the staged commit boundary", async () => {
  const format = [process.execPath, "-e", "const fs=require('node:fs');fs.writeFileSync('src/a.ts','formatted\\n');fs.appendFileSync('receipt.json','format\\n')"];
  const validate = [process.execPath, "-e", "require('node:fs').appendFileSync('receipt.json','validate\\n')"];
  const root = await createDeclaredCheckRepository({
    format: { command: format, gate: "commit", mode: "files", inputs: ["src/a.ts"], fixes: true },
    validate: { command: validate, gate: "commit", mode: "files", inputs: ["src/a.ts"] },
  });
  repositories.push(root);
  const first = await runArc(["check", "increment", "--json"], root);
  expect(first.exitCode, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout).result.checks.map((check: { outcome: string }) => check.outcome)).toEqual(["passed", "passed"]);
  await git("git", ["add", "-A"], { cwd: root });
  const hook = await runArc(["check", "pre-commit", "--json"], root);
  expect(hook.exitCode, hook.stderr).toBe(0);
  expect(JSON.parse(hook.stdout).result.checks.map((check: { outcome: string }) => check.outcome)).toEqual(["reused", "reused"]);
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("format\nvalidate\n");
});

it("records no pass when a successful command rewrites content during verification", async () => {
  const root = await createDeclaredCheckRepository({ format: { command, gate: "commit", inputs: ["src/a.ts"], fixes: true } });
  repositories.push(root);
  const result = await runArc(["check", "gate", "commit", "--changed", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(1);
  const records = await readdir(join(root, ".git/arc-checks")).catch(() => []);
  expect(records.filter(path => /^[a-f0-9]{64}\.json$/u.test(path))).toEqual([]);
});

it("invalidates a later fixer's earlier pass when the first fixer changes its inputs", async () => {
  const capture = [process.execPath, "-e", "require('node:fs').appendFileSync('receipt.json','second\\n')"];
  const root = await createDeclaredCheckRepository({
    first: { command, gate: "commit", inputs: ["src/a.ts"], fixes: true },
    second: { command: capture, gate: "commit", inputs: ["src/a.ts"], fixes: true },
  });
  repositories.push(root);
  const primed = await runArc(["check", "run", "second", "--json"], root);
  expect(primed.exitCode, primed.stderr).toBe(0);
  const result = await runArc(["check", "increment", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks[1].outcome).toBe("passed");
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("second\nsecond\n");
});

it("gives a later file fixer the content tree produced by the earlier fixer", async () => {
  const inspect = [process.execPath, "-e", "const tree=process.env.ARC_CHECK_TREE;const content=require('node:child_process').execFileSync('git',['show',tree+':src/a.ts'],{encoding:'utf8'});require('node:fs').writeFileSync('receipt.json',JSON.stringify({tree,content}))"];
  const root = await createDeclaredCheckRepository({
    first: { command, gate: "commit", inputs: ["src/a.ts"], fixes: true, cache: false },
    second: { command: inspect, gate: "commit", mode: "files", inputs: ["src/a.ts"], fixes: true, cache: false },
  });
  repositories.push(root);
  const result = await runArc(["check", "increment", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  const observed = JSON.parse(await readFile(join(root, "receipt.json"), "utf8"));
  expect(observed.content).toBe("formatted\n");
  expect(observed.tree).toBe(JSON.parse(result.stdout).result.tree);
});

it("does not reuse an earlier fixer's pass after a later fixer rewrites its inputs", async () => {
  const first = [process.execPath, "-e", "const fs=require('node:fs');fs.writeFileSync('src/a.ts',fs.readFileSync('src/a.ts','utf8').replace('changed','formatted'));fs.appendFileSync('receipt.json','first\\n')"];
  const second = [process.execPath, "-e", "const fs=require('node:fs');fs.writeFileSync('src/a.ts',fs.readFileSync('src/a.ts','utf8').replace('formatted','finished'));fs.appendFileSync('receipt.json','second\\n')"];
  const root = await createDeclaredCheckRepository({
    first: { command: first, gate: "commit", inputs: ["src/a.ts"], fixes: true },
    second: { command: second, gate: "commit", inputs: ["src/a.ts"], fixes: true },
  });
  repositories.push(root);
  const increment = await runArc(["check", "increment", "--json"], root);
  expect(increment.exitCode, increment.stderr).toBe(0);
  await git("git", ["add", "-A"], { cwd: root });
  const hook = await runArc(["check", "pre-commit", "--json"], root);
  expect(hook.exitCode, hook.stderr).toBe(0);
  expect(JSON.parse(hook.stdout).result.checks.map((check: { outcome: string }) => check.outcome)).toEqual(["passed", "reused"]);
  expect(await readFile(join(root, "receipt.json"), "utf8")).toBe("first\nsecond\nfirst\n");
});

it("keeps selection fixed until a subsequent request includes an outside rewrite", async () => {
  const outside = [process.execPath, "-e", "const fs=require('node:fs');fs.writeFileSync('src/a.ts','formatted\\n');fs.writeFileSync('docs/b.md','rewritten\\n')"];
  const root = await createDeclaredCheckRepository({
    format: { command: outside, gate: "commit", inputs: ["src/a.ts"], fixes: true, cache: false },
    docs: { command: [process.execPath, "capture.cjs"], gate: "commit", mode: "files", inputs: ["docs/**"], widen: false, cache: false },
  });
  repositories.push(root);
  const first = await runArc(["check", "increment", "--json"], root);
  expect(first.exitCode, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout).result.checks[1].outcome).toBe("not selected");
  const second = await runArc(["check", "increment", "--json"], root);
  expect(second.exitCode, second.stderr).toBe(0);
  expect(JSON.parse(second.stdout).result.checks[1].outcome).toBe("passed");
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8")).args).toEqual(["docs/b.md"]);
});

it("keeps an all-files request's arguments fixed when a fixer creates another input", async () => {
  const create = [process.execPath, "-e", "require('node:fs').writeFileSync('src/new.ts','created\\n')"];
  const root = await createDeclaredCheckRepository({
    create: { command: create, mode: "files", inputs: ["src/**"], fixes: true, cache: false },
    validate: { command: [process.execPath, "capture.cjs"], mode: "files", inputs: ["src/**"], cache: false },
  });
  repositories.push(root);
  const first = await runArc(["check", "run", "create", "validate", "--json"], root);
  expect(first.exitCode, first.stderr).toBe(0);
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8")).args).toEqual(["src/a.ts", "src/deleted.ts"]);
  const second = await runArc(["check", "run", "create", "validate", "--json"], root);
  expect(second.exitCode, second.stderr).toBe(0);
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8")).args).toEqual(["src/a.ts", "src/deleted.ts", "src/new.ts"]);
});

it("omits a selected file that an earlier fixer deleted", async () => {
  const remove = [process.execPath, "-e", "require('node:fs').rmSync('src/deleted.ts',{force:true})"];
  const root = await createDeclaredCheckRepository({
    remove: { command: remove, inputs: ["src/**"], fixes: true, cache: false },
    validate: { command: [process.execPath, "capture.cjs"], mode: "files", inputs: ["src/**"], cache: false },
  });
  repositories.push(root);
  const result = await runArc(["check", "run", "remove", "validate", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8")).args).toEqual(["src/a.ts"]);
});

it.each(["forming", "verifying"])("gives the first index-reading fixer the %s staged-request coordinate", async purpose => {
  const inspect = [process.execPath, "-e", "const git=(...args)=>require('node:child_process').execFileSync('git',args,{encoding:'utf8'}).trim();require('node:fs').writeFileSync('receipt.json',JSON.stringify({content:git('show',':src/a.ts'),tree:git('write-tree'),turn:process.env.ARC_CHECK_TREE,index:process.env.GIT_INDEX_FILE}))"];
  const root = await createDeclaredCheckRepository({ inspect: {
    command: inspect, gate: "commit", mode: "files", inputs: ["src/a.ts"], fixes: true, reads_index: true,
  } });
  repositories.push(root);
  await git("git", ["add", "src/a.ts"], { cwd: root });
  await git("git", ["write-tree"], { cwd: root });
  const ownIndex = await readFile(join(root, ".git/index"));
  await writeFile(join(root, "src/a.ts"), "forming\n");
  const form = purpose === "forming" ? ["run", "inspect"] : ["gate", "commit"];
  const result = await runArc(["check", ...form, "--staged", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  const observed = JSON.parse(await readFile(join(root, "receipt.json"), "utf8"));
  expect(observed.content, JSON.stringify(observed)).toBe(purpose === "forming" ? "forming" : "changed");
  expect(observed.tree).toBe(observed.turn);
  expect(observed.tree).toBe(JSON.parse(result.stdout).result.tree);
  expect(await readFile(join(root, ".git/index"))).toEqual(ownIndex);
  if (purpose === "verifying") expect(JSON.parse(result.stdout).result.checks[0].divergent).toEqual(["src/a.ts"]);
});
