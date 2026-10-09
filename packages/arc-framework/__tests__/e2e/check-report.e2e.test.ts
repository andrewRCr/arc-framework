/** Native reports retain complete execution output and disposable timing metadata. */
import { afterEach, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const repositories: string[] = [];
const git = promisify(execFile);
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

it("retains complete failed output and measured cost in distinct logs across retries", async () => {
  const output = Array.from({ length: 40 }, (_, index) => `diagnostic-${index}`).join("\n");
  const root = await createDeclaredCheckRepository({ check: {
    command: [process.execPath, "-e", `console.log(${JSON.stringify(output)});process.exit(1)`],
  } });
  repositories.push(root);
  const first = await runArc(["check", "run", "check", "--json"], root);
  expect(first.exitCode, first.stderr).toBe(1);
  const check = JSON.parse(first.stdout).result.checks[0];
  expect(check.logPath).toEqual(expect.any(String));
  expect(dirname(check.logPath)).toBe(join(root, ".git/arc-checks"));
  expect(await readFile(check.logPath, "utf8")).toBe(output);
  expect(check.costMs).toBeGreaterThanOrEqual(0);
  expect(JSON.parse(await readFile(`${check.logPath}.json`, "utf8"))).toMatchObject({
    id: "check", costMs: check.costMs, logPath: check.logPath,
  });
  const retry = await runArc(["check", "run", "check", "--json"], root);
  expect(JSON.parse(retry.stdout).result.checks[0].logPath).not.toBe(check.logPath);
  expect(await readFile(check.logPath, "utf8")).toBe(output);
});

it("precomposes verification from actual failed and successful outcomes", async () => {
  const root = await createDeclaredCheckRepository({
    success: { command: [process.execPath, "-e", "process.exit(0)"] },
    failure: { command: [process.execPath, "-e", "process.exit(1)"] },
  });
  repositories.push(root);
  const result = await runArc(["check", "run", "success", "failure", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(JSON.parse(result.stdout).result.verification).toBe("Checks: success passed; failure failed.");
});

it("reruns an ordinary failure by id over its resolved range without CI", async () => {
  const root = await createDeclaredCheckRepository({ check: {
    gate: "commit", inputs: ["src/**"], command: [process.execPath, "-e", "console.log('repair input');process.exit(1)"],
  } });
  repositories.push(root);
  const result = await runArc(["check", "gate", "commit", "--range", "HEAD", "--ci", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(1);
  const report = JSON.parse(result.stdout).result;
  expect(report.checks[0].remedy).toBe(`arc check run check --range ${report.base}`);
});

it("retries a widened file check through its original request including CI", async () => {
  const root = await createDeclaredCheckRepository({ check: {
    gate: "commit", mode: "files", inputs: ["src/**"], command: [process.execPath, "-e", "process.exit(1)"],
  } });
  repositories.push(root);
  await writeFile(join(root, "unknown.txt"), "uncovered input\n");
  const result = await runArc(["check", "gate", "commit", "--range", "HEAD", "--ci", "--force", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(JSON.parse(result.stdout).result.checks[0].remedy).toBe("arc check gate commit --ci --force --range HEAD");
});

it("names the guarded commit when a hook widens a file check", async () => {
  const root = await createDeclaredCheckRepository({ check: {
    gate: "commit", mode: "files", inputs: ["src/**"], command: [process.execPath, "-e", "process.exit(1)"],
  } });
  repositories.push(root);
  await writeFile(join(root, "unknown.txt"), "uncovered input\n");
  await git("git", ["add", "-A"], { cwd: root });
  const result = await runArc(["check", "pre-commit", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(JSON.parse(result.stdout).result.checks[0].remedy).toBe("git commit");
});

it("keeps CI human output in project check vocabulary", async () => {
  const root = await createDeclaredCheckRepository({ "project-lint": {
    command: [process.execPath, "-e", "console.log('source diagnostic');process.exit(1)"], gate: "merge",
  } });
  repositories.push(root);
  const result = await runArc(["check", "gate", "merge", "--ci"], root);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(result.stdout).toContain("project-lint: failed");
  expect(result.stdout).toContain("source diagnostic");
  expect(result.stdout).not.toMatch(/arc check|enforcement|feedback|work unit|segment/iu);
});

it("offers a local fixer retry that repairs content after verification rejects a rewrite", async () => {
  const root = await createDeclaredCheckRepository({ format: {
    gate: "merge", fixes: true, inputs: ["src/**"], command: [process.execPath, "-e",
      "require('node:fs').writeFileSync('src/a.ts','formatted\\n')"],
  } });
  repositories.push(root);
  const verification = await runArc(["check", "gate", "merge", "--ci", "--json"], root);
  expect(verification.exitCode, verification.stderr).toBe(1);
  const check = JSON.parse(verification.stdout).result.checks[0];
  expect(check).toMatchObject({ remedy: "arc check run format --all", rewritten: ["src/a.ts"] });
  await writeFile(join(root, "src/a.ts"), "unformatted again\n");
  const retry = await runArc(check.remedy.split(" ").slice(1), root);
  expect(retry.exitCode, retry.stderr).toBe(0);
  expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe("formatted\n");
  expect(retry.stdout).toContain("rewrote: src/a.ts");
});

it("keeps a check's outcome when its disposable log directory is unavailable", async () => {
  const root = await createDeclaredCheckRepository({ check: {
    cache: false, command: [process.execPath, "-e", "console.log('ran successfully')"],
  } });
  repositories.push(root);
  await writeFile(join(root, ".git/arc-checks"), "not a directory\n");
  const result = await runArc(["check", "run", "check", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  const check = JSON.parse(result.stdout).result.checks[0];
  expect(check).toMatchObject({ outcome: "passed", output: "ran successfully" });
  expect(check.logPath).toBeUndefined();
  expect(check.costMs).toBeGreaterThanOrEqual(0);
});

it("explicitly reports when a failed fixer rewrote no files", async () => {
  const root = await createDeclaredCheckRepository({ format: {
    fixes: true, inputs: ["src/**"], command: [process.execPath, "-e", "process.exit(1)"],
  } });
  repositories.push(root);
  const result = await runArc(["check", "run", "format", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(JSON.parse(result.stdout).result.checks[0].rewritten).toEqual([]);
  const human = await runArc(["check", "run", "format"], root);
  expect(human.stdout).toContain("rewrote no files");
});
