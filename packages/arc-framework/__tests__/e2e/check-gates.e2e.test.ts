/** Cumulative deadlines and preset feedback through the built CLI. */
import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";
const repositories: string[] = [];
const git = promisify(execFile);
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });
const command = [process.execPath, "-e", "console.log('checked')"];
const checks = {
  commit: { command, gate: "commit", inputs: ["src/**"] },
  push: { command, gate: "push", inputs: ["src/**"] },
  merge: { command, gate: "merge", inputs: ["src/**"] },
  manual: { command, inputs: ["src/**"] },
};
async function fixture(declaration = checks): Promise<string> {
  const root = await createDeclaredCheckRepository(declaration);
  repositories.push(root);
  return root;
}
it.each([
  { gate: "commit", ids: ["commit"] },
  { gate: "push", ids: ["commit", "push"] },
  { gate: "merge", ids: ["commit", "push", "merge"] },
])("includes every earlier deadline at the $gate gate", async ({ gate, ids }) => {
  const root = await fixture();
  const result = await runArc(["check", "gate", gate, "--all", "--force", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks.map(({ id, kind }: { id: string; kind: string }) => ({ id, kind })))
    .toEqual(ids.map(id => ({ id, kind: "enforcement" })));
});

it("keeps selection and outcomes identical under all commit and push interlock settings", async () => {
  const root = await fixture();
  let reference: unknown;
  for (const commit of ["manual", "on-task-approval", "on-workflow"]) {
    for (const push of ["manual", "on-sync", "on-workflow"]) {
      await git("git", ["config", "arc.commitInterlock", commit], { cwd: root });
      await git("git", ["config", "arc.pushInterlock", push], { cwd: root });
      const result = await runArc(["check", "gate", "push", "--all", "--force", "--json"], root);
      expect(result.exitCode, result.stderr).toBe(0);
      const outcomes = JSON.parse(result.stdout).result.checks;
      reference ??= outcomes;
      expect(outcomes).toEqual(reference);
    }
  }
});

it("returns failure for a feedback-only failure and labels both kinds in human output", async () => {
  const root = await createDeclaredCheckRepository({
    commit: checks.commit,
    push_files: { command: [process.execPath, "-e", "process.exit(12)"], gate: "push", mode: "files", inputs: ["src/**"] },
  });
  repositories.push(root);
  const result = await runArc(["check", "increment"], root);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(result.stdout).toContain("commit: passed [enforcement]");
  expect(result.stdout).toContain("push_files: failed [feedback]");
});
it("reports a failing push files check as feedback beside commit enforcement at an increment", async () => {
  const root = await createDeclaredCheckRepository({
    commit: { command: [process.execPath, "-e", "process.exit(11)"], gate: "commit", inputs: ["src/**"] },
    push_files: { command: [process.execPath, "-e", "process.exit(12)"], gate: "push", mode: "files", inputs: ["src/**"] },
    push_project: checks.push, merge: checks.merge, manual: checks.manual,
  });
  repositories.push(root);
  const result = await runArc(["check", "increment", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([
    { id: "commit", kind: "enforcement", outcome: "failed" },
    { id: "push_files", kind: "feedback", outcome: "failed" },
  ]);
  expect(JSON.parse(result.stdout).result.checks).toHaveLength(2);
});
it.each([{ form: ["segment"] }, { form: ["new-head", "--from", "HEAD"] }])("runs commit and push enforcement for $form", async ({ form }) => {
  const root = await fixture();
  const result = await runArc(["check", ...form, "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([
    { id: "commit", kind: "enforcement", outcome: "passed" }, { id: "push", kind: "enforcement", outcome: "passed" },
  ]);
  expect(JSON.parse(result.stdout).result.checks).toHaveLength(2);
});
it("labels an explicit named request as feedback without a deadline", async () => {
  const root = await fixture();
  const result = await runArc(["check", "run", "commit", "manual", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([
    { id: "commit", kind: "feedback", outcome: "passed" }, { id: "manual", kind: "feedback", outcome: "passed" },
  ]);
});
