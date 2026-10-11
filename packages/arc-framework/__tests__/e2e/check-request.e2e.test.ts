/** Typed check forms and their declared request boundaries through the built CLI. */
import { afterEach, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const repositories: string[] = [];
const gitExec = promisify(execFile);
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });
async function fixture(): Promise<string> {
  const root = await createDeclaredCheckRepository({
    named: { command: [process.execPath, "capture.cjs"], inputs: ["src/**"] },
  });
  repositories.push(root);
  return root;
}

it("refuses an unknown named check and succeeds when the request names a declared check", async () => {
  const root = await fixture();
  const refused = await runArc(["check", "run", "missing", "--json"], root);
  expect(refused.exitCode, refused.stderr).toBe(2);
  expect(JSON.parse(refused.stdout).error.message).toContain("missing");
  await expect(readFile(join(root, "receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
  const repaired = await runArc(["check", "run", "named", "--json"], root);
  expect(repaired.exitCode, repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout)).toMatchObject({ result: { checks: [{ id: "named", outcome: "passed" }] } });
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8"))).toMatchObject({ args: [], cwd: root });
});

it.each([
  { scope: ["--staged"], paths: ["src/a.ts"], content: "index\n" },
  { scope: ["--changed"], paths: ["src/a.ts"], content: "worktree\n" },
  { scope: ["--range", "HEAD"], paths: ["src/a.ts"], content: "worktree\n" },
  { scope: ["--all"], paths: ["src/a.ts", "src/deleted.ts"], content: "worktree\n" },
  { scope: ["--paths", "src/deleted.ts"], paths: ["src/deleted.ts"], content: "worktree\n" },
])("resolves $scope to its file set and checked content", async ({ scope, paths, content }) => {
  const root = await createDeclaredCheckRepository({ files: {
    command: [process.execPath, "capture.cjs"], mode: "files", inputs: ["src/**"], gate: "commit",
  } });
  repositories.push(root);
  await writeFile(join(root, "src/a.ts"), "index\n");
  await gitExec("git", ["add", "src/a.ts"], { cwd: root });
  await writeFile(join(root, "src/a.ts"), "worktree\n");
  const result = await runArc(["check", "gate", "commit", ...scope, "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  const request = JSON.parse(result.stdout).result;
  expect(request.checks).toMatchObject([{ id: "files", outcome: "passed" }]);
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8"))).toMatchObject({ args: paths });
  expect((await gitExec("git", ["show", `${request.tree}:src/a.ts`], { cwd: root })).stdout).toBe(content);
});

it.each([
  { form: ["gate", "commit"], gate: "commit", paths: ["src/a.ts"] },
  { form: ["gate", "push"], gate: "push", paths: ["src/a.ts"] },
  { form: ["gate", "merge"], gate: "merge", paths: ["src/a.ts", "src/deleted.ts"] },
  { form: ["run", "files"], gate: "commit", paths: ["src/a.ts", "src/deleted.ts"] },
])("applies the default scope for $form", async ({ form, gate, paths }) => {
  const root = await createDeclaredCheckRepository({ files: {
    command: [process.execPath, "capture.cjs"], mode: "files", inputs: ["src/**"], gate,
  } });
  repositories.push(root);
  const result = await runArc(["check", ...form, "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8"))).toMatchObject({ args: paths });
});

it.each([
  { form: ["gate", "commit", "--range"] },
  { form: ["new-head", "--from"] },
])("refuses an unresolved named base for $form and accepts a repaired ref", async ({ form }) => {
  const root = await fixture();
  const refused = await runArc(["check", ...form, "missing-base", "--json"], root);
  expect(refused.exitCode, refused.stderr).toBe(2);
  expect(JSON.parse(refused.stdout).error.message).toContain("missing-base");
  await expect(readFile(join(root, "receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
  const repaired = await runArc(["check", ...form, "HEAD", "--json"], root);
  expect(repaired.exitCode, repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).result.base).toMatch(/^[0-9a-f]{40}$/u);
});

it("uses the configured base branch's own upstream for an unpublished segment", async () => {
  const root = await fixture();
  const original = (await gitExec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await gitExec("git", ["branch", "trunk"], { cwd: root });
  await gitExec("git", ["remote", "add", "team", "/unused/remote"], { cwd: root });
  await gitExec("git", ["update-ref", "refs/remotes/team/trunk", original], { cwd: root });
  await gitExec("git", ["branch", "--set-upstream-to=team/trunk", "trunk"], { cwd: root });
  await gitExec("git", ["add", "src/a.ts"], { cwd: root });
  await gitExec("git", ["commit", "-m", "feature"], { cwd: root });
  const feature = (await gitExec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await gitExec("git", ["branch", "-f", "trunk", feature], { cwd: root });
  await writeFile(join(root, ".arc/system/arc-config.yml"), "branch.base: trunk\n");
  const result = await runArc(["check", "segment", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.base).toBe(original);
});

it("rejects two scopes and then accepts the repaired request", async () => {
  const root = await fixture();
  const refused = await runArc(["check", "run", "named", "--staged", "--changed", "--json"], root);
  expect(refused.exitCode, refused.stderr).toBe(2);
  expect(refused.stdout + refused.stderr).toMatch(/scope|conflict/iu);
  await expect(readFile(join(root, "receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
  const repaired = await runArc(["check", "run", "named", "--changed", "--json"], root);
  expect(repaired.exitCode, repaired.stderr).toBe(0);
});

it("reports a CI flag on a hook form as a usage error with exit 2", async () => {
  const root = await fixture();
  const refused = await runArc(["check", "pre-commit", "--ci", "--json"], root);
  expect(refused.exitCode, refused.stderr).toBe(2);
  expect(JSON.parse(refused.stdout)).toMatchObject({ schemaVersion: 1, error: {
    kind: "usage", message: expect.stringContaining("--ci"),
  } });
  expect(refused.stderr).toBe("");
  await expect(readFile(join(root, "receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("forecasts a named request without running it and accepts serial execution", async () => {
  const root = await fixture();
  const forecast = await runArc(["check", "run", "named", "--dry-run", "--serial", "--json"], root);
  expect(forecast.exitCode, forecast.stderr).toBe(0);
  expect(JSON.parse(forecast.stdout).result.checks).toMatchObject([{ id: "named", outcome: "would run" }]);
  await expect(readFile(join(root, "receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
  const executed = await runArc(["check", "run", "named", "--serial", "--json"], root);
  expect(executed.exitCode, executed.stderr).toBe(0);
  expect(JSON.parse(executed.stdout).result.checks).toMatchObject([{ id: "named", outcome: "passed" }]);
});

it("includes CI-only checks when the request explicitly supplies CI", async () => {
  const root = await createDeclaredCheckRepository({ ci: {
    command: [process.execPath, "capture.cjs"], inputs: ["src/**"], gate: "commit", ci_only: true,
  } });
  repositories.push(root);
  const result = await runArc(["check", "gate", "commit", "--ci", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ id: "ci", outcome: "passed" }]);
});

it.each([
  { args: ["gate", "unknown"], input: "unknown" },
  { args: ["gate"], input: "gate" },
  { args: ["gate", "commit", "extra"], input: "argument" },
  { args: ["segment", "--unknown"], input: "--unknown" },
  { args: ["new-head"], input: "--from" },
  { args: ["run"], input: "ids" },
])("reports malformed $args with exit 2 before running any check", async ({ args, input }) => {
  const root = await fixture();
  const result = await runArc(["check", ...args, "--json"], root);
  expect(result.exitCode, result.stderr).toBe(2);
  expect(result.stdout + result.stderr).toContain(input);
  await expect(readFile(join(root, "receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("renders check help successfully without running a declared check", async () => {
  const root = await fixture();
  const result = await runArc(["check", "gate", "--help"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stdout).toContain("--range");
  await expect(readFile(join(root, "receipt.json"))).rejects.toMatchObject({ code: "ENOENT" });
});
