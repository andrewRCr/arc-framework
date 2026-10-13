import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { load } from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";
import { createTempRepo, cleanupTempDir, execFileAsync } from "../helpers/integration.js";
import { runScript } from "../helpers/run-script.js";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");
const prosePath = "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md";
const hookPath = ".arc/system/.internal/githooks/pre-push";
const roots: string[] = [];

interface Job { if: string; steps: Array<{ id?: string; run?: string }> }
interface Workflow { jobs: Record<string, Job> }

async function write(root: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

async function commit(root: string, message: string): Promise<string> {
  await execFileAsync("git", ["add", "--all"], { cwd: root });
  await execFileAsync("git", ["commit", "-qm", message], { cwd: root });
  return (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
}

function selected(job: Job, event: string, outputs: Record<string, string>): boolean {
  expect(job.if).toMatch(/^\$\{\{[\s\S]+\}\}$/u);
  const expression = job.if.slice(3, -2).trim();
  return Boolean(runInNewContext(expression, {
    cancelled: () => false,
    github: { event_name: event },
    needs: { classify: { result: "success", outputs }, setup: { result: "success" }, build: { result: "success" } },
  }, { timeout: 1000 }));
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => cleanupTempDir(root)));
});

describe("light PR content selection for E2E", () => {
  it.each([
    ["packaged prose", prosePath, false, true],
    ["project hook", hookPath, false, true],
    ["prose on verified code", prosePath, true, true],
    ["planning record", ".arc/backlog/planned/example/meta-example.md", false, false],
  ] as const)("uses the authored classifier and job conditions for %s", async (_name, path, verified, expected) => {
    const root = await createTempRepo();
    roots.push(root);
    for (const input of ["scripts/classify-change.sh", "packages/arc-framework/src/lib/change-facts.ts"]) {
      await write(root, input, await readFile(join(repositoryRoot, input), "utf8"));
    }
    await write(root, "package.json", '{"type":"module"}\n');
    const content = path === prosePath || path === hookPath ? await readFile(join(repositoryRoot, path), "utf8") : "# Plan\n";
    await write(root, path, content);
    await write(root, "packages/arc-framework/src/example.ts", "export const value = 1;\n");
    const base = await commit(root, "baseline");
    await execFileAsync("git", ["checkout", "-qb", "feature"], { cwd: root });
    if (verified) {
      await write(root, "packages/arc-framework/src/example.ts", "export const value = 2;\n");
      await commit(root, "verified code change");
    }
    const previousTree = await runScript(join(root, "scripts/classify-change.sh"), ["tree-hash", "HEAD"], { cwd: root });
    await write(root, path, `${content}\n<!-- changed content -->\n`);
    const head = await commit(root, "content change");
    const currentTree = await runScript(join(root, "scripts/classify-change.sh"), ["tree-hash", head], { cwd: root });
    expect(previousTree.exitCode).toBe(0);
    expect(currentTree.exitCode).toBe(0);
    expect(currentTree.stdout).toBe(previousTree.stdout);

    const workflow = load(await readFile(join(repositoryRoot, ".github/workflows/ci.yml"), "utf8")) as Workflow;
    const source = workflow.jobs.classify!.steps.find(step => step.id === "c")!.run!;
    const values: Record<string, string> = {
      "github.event.pull_request.base.sha": base, "github.event.pull_request.head.sha": head,
      "github.event.before": base, "github.sha": head,
    };
    const script = source.replace(/\$\{\{\s*([^}]+?)\s*\}\}/gu, (_match, key: string) => {
      if (values[key] === undefined) throw new Error(`Unrecognized workflow expression: ${key}`);
      return values[key];
    });
    const scriptPath = join(root, "classify-step.sh");
    await writeFile(scriptPath, script);
    const outputPath = join(root, "outputs");
    const result = await runScript(scriptPath, [], { cwd: root, env: {
      EVENT_NAME: "pull_request", EVENT_ACTION: "synchronize", TESTED_TREE_VERIFIED: String(verified),
      GITHUB_OUTPUT: outputPath, GITHUB_STEP_SUMMARY: join(root, "summary"),
    } });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    const outputs = Object.fromEntries((await readFile(outputPath, "utf8")).trim().split("\n").map(line => line.split("=")));
    expect(outputs.weight).toBe("light");
    expect(outputs.reason).toBe(verified ? "verified" : "docs-only");
    expect(selected(workflow.jobs.e2e!, "pull_request", outputs)).toBe(expected);
    if (expected) expect(selected(workflow.jobs.build!, "pull_request", outputs)).toBe(true);
    expect(selected(workflow.jobs.portability!, "pull_request", outputs)).toBe(false);
    expect(selected(workflow.jobs.e2e!, "push", outputs)).toBe(false);
    expect(selected(workflow.jobs.e2e!, "schedule", outputs)).toBe(true);
    expect(selected(workflow.jobs.e2e!, "workflow_dispatch", outputs)).toBe(true);
  });
});
