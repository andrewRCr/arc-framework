/** The repository's actual CI map consumes the declaration's merge forecast. */
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { load } from "js-yaml";
import { expect, it } from "vitest";
import { execa } from "execa";
import { gitExec } from "../../src/lib/io-context.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { resolveCheckForecast } from "../../src/lib/checks/forecast.js";
import { selectChangedInputs } from "../../src/lib/checks/matching.js";
import { selectRequestChecks } from "../../src/lib/checks/gates.js";
import { CheckPlumbingSchema, validateCheckPlumbing } from "../../src/lib/ci-check-plumbing.js";

it("accepts the actual workflow and map against every merge-gate declaration entry", async () => {
  const root = resolve(import.meta.dirname, "../../../..");
  const readYaml = async (path: string) => load(await readFile(resolve(root, path), "utf8"));
  const declaration = CheckDeclarationSchema.parse(await readYaml(".arc/system/arc-checks.yml"));
  const checks = selectRequestChecks(declaration.checks, { kind: "gate", gate: "merge" })
    .map(([id, check]) => ({ id, kind: "enforcement" as const, outcome: "would run" as const,
      ...resolveCheckForecast(check, root, [], process.platform) }));
  const plumbing = CheckPlumbingSchema.parse(await readYaml(".github/check-plumbing.yml"));
  const workflow = await readYaml(".github/workflows/ci.yml");
  expect(() => validateCheckPlumbing(checks, plumbing, workflow)).not.toThrow();
});

it("publishes a forecast whose checked tree exists in another clean checkout", async () => {
  const sourceRoot = resolve(import.meta.dirname, "../../../..");
  const root = await mkdtemp(resolve(tmpdir(), "arc-ci-forecast-"));
  const runnerTemp = await mkdtemp(resolve(tmpdir(), "arc-ci-runner-temp-"));
  try {
    await mkdir(resolve(root, ".arc/system"), { recursive: true });
    await mkdir(resolve(root, "packages"));
    await symlink(resolve(sourceRoot, "node_modules"), resolve(root, "node_modules"), "junction");
    await symlink(resolve(sourceRoot, "packages/arc-framework"), resolve(root, "packages/arc-framework"), "junction");
    await writeFile(resolve(root, ".gitignore"), "node_modules/\n");
    await writeFile(resolve(root, ".arc/system/arc-checks.yml"),
      "checks:\n  verify:\n    gate: merge\n    command: [node, --version]\n");
    for (const args of [["init", "-b", "main"], ["add", "-A"],
      ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-qm", "fixture"]]) {
      await gitExec("git", args, { cwd: root });
    }
    const workflow = load(await readFile(resolve(sourceRoot, ".github/workflows/ci.yml"), "utf8")) as {
      jobs: { setup: { steps: Array<{ id?: string; run?: string }> } };
    };
    const run = workflow.jobs.setup.steps.find(step => step.id === "forecast")?.run;
    if (!run) throw new Error("Missing forecast step");
    const result = await execa("bash", ["-c", run], { cwd: root, reject: false,
      env: { FORCE_COLOR: undefined, RUNNER_TEMP: runnerTemp } });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    const forecast = JSON.parse(await readFile(resolve(root, ".arc-check-forecast.json"), "utf8"));
    const headTree = (await gitExec("git", ["rev-parse", "HEAD^{tree}"], { cwd: root })).stdout;
    expect(forecast.result.tree).toBe(headTree);
    const consumer = resolve(runnerTemp, "consumer");
    await gitExec("git", ["clone", "--quiet", "--no-local", root, consumer], { cwd: runnerTemp });
    await expect(gitExec("git", ["cat-file", "-e", `${forecast.result.tree}^{tree}`], { cwd: consumer }))
      .resolves.toMatchObject({ stdout: "" });
  } finally { await Promise.all([root, runnerTemp].map(path => rm(path, { recursive: true, force: true }))); }
}, 30_000);

it.each([
  [".arc/system/methods/test-first.md", false],
  ["packages/arc-framework/arc/reference/templates/arc/work-unit/template-tasks.md", false],
  ["packages/arc-framework/src/lib/example.ts", true],
  ["packages/arc-framework/__tests__/unit/example.test.ts", true],
  ["packages/arc-framework/__tests__/fixtures/scenario.md", true],
  ["packages/arc-framework/templates/meta-work-unit.md", true],
] as const)("routes the real declaration's changed input %s to its owning checks", async (path, unitSelected) => {
  const sourceRoot = resolve(import.meta.dirname, "../../../..");
  const declaration = CheckDeclarationSchema.parse(load(await readFile(
    resolve(sourceRoot, ".arc/system/arc-checks.yml"), "utf8",
  )));
  const root = await mkdtemp(resolve(tmpdir(), "arc-check-markdown-input-"));
  try {
    const args = [["init", "-b", "main"], ["-c", "user.email=test@example.com",
      "-c", "user.name=Test", "commit", "--allow-empty", "-qm", "fixture"]];
    for (const command of args) await gitExec("git", command, { cwd: root });
    const base = (await gitExec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout;
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), "changed input\n");
    await gitExec("git", ["add", "--", path], { cwd: root });
    const tree = (await gitExec("git", ["write-tree"], { cwd: root })).stdout;
    for (const [id, selected] of [["test:unit", unitSelected], ["test:arc-contracts", true]] as const) {
      const result = await selectChangedInputs(gitExec, root, base, tree, declaration.checks[id]!.inputs);
      expect(result, id).toEqual(selected
        ? { status: "selected", paths: [expect.objectContaining({ path, status: "A" })] }
        : { status: "not selected", reason: "inputs unchanged" });
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
