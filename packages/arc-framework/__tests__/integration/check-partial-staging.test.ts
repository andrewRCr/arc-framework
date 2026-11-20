/** A partly staged commit is refused only for checks that would read the working tree instead of the staged content. */
import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { runDeclaredRequest, type DeclaredCheckDependencies } from "../../src/handlers/check/run.js";
import { gitExec, gitExecInput } from "../../src/lib/io-context.js";
import { environmentForGitCwd } from "../../src/lib/git/process-executor.js";

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => { await removeGitBackedDirs(roots.splice(0)); });

const DECLARED = {
  native: {},
  indexed: { reads_index: true },
  routed: { runner: true },
} as const;
type DeclaredId = keyof typeof DECLARED;
type RunnerReading = "configured" | "absent" | "unreadable" | "removed after the first read";

/** A repository whose one input file has a staged change and a further unstaged one, checked by the named checks. */
async function partlyStaged(ids: DeclaredId[], runner: RunnerReading) {
  const checks = Object.fromEntries(ids.map(id => [id, { command: [id], gate: "commit", mode: "project", inputs: ["src/**"],
    cache: false, ...DECLARED[id] }]));
  const root = await createDeclaredCheckRepository(checks);
  roots.push(root);
  await exec("git", ["add", "src/a.ts"], { cwd: root, env: environmentForGitCwd(root) });
  await writeFile(join(root, "src/a.ts"), "changed\nunstaged hunk\n");
  const definition = CheckDeclarationSchema.parse({ checks });
  const executed: string[] = [];
  const routedSources: string[] = [];
  let runnerReads = 0;
  const io: DeclaredCheckDependencies = {
    git: gitExec, gitInput: gitExecInput, platform: process.platform, availableParallelism: () => 1,
    passes: { get: async () => null, put: async () => ({ status: "recorded" }) },
    readDeclaration: async () => ({ status: "valid", location: ".arc/system/arc-checks.yml", value: definition }),
    runtime: async () => ({ exitCode: 0, stdout: "" }),
    execute: async command => { executed.push(command[0]!); return { started: true, exitCode: 0, output: "" }; },
    readRunnerConfiguration: async check => {
      if (!check.runner) return undefined;
      runnerReads++;
      if (runner === "absent" || (runner === "removed after the first read" && runnerReads > 1)) return undefined;
      if (runner === "unreadable") throw new Error("checks.runner contains malformed YAML");
      return { file: "machine.yml", argv: ["adapter"] };
    },
    prepareExecution: input => {
      routedSources.push(input.request.source.kind);
      return Object.assign(Promise.resolve({ status: "unavailable" as const, origin: "runner" as const,
        reason: "Runner stopped after preparation", remedy: "Retry." }), {
        planId: "726ea270-cdb4-49d0-8e30-de4ffb6d4566", retained: undefined,
        cancel: async () => undefined, terminate: () => undefined,
      });
    },
  };
  return { run: () => runDeclaredRequest(root, io, { form: { kind: "pre-commit" } }), executed, routedSources,
    runnerReads: () => runnerReads };
}

it("runs index-reading and routed checks over the staged content without refusing", async () => {
  const { run, executed, routedSources } = await partlyStaged(["indexed", "routed"], "configured");
  await expect(run()).resolves.toMatchObject({ kind: "result", result: { checks: [
    { id: "indexed", outcome: "passed" }, { id: "routed", outcome: "couldn't run" }] } });
  expect(executed).toEqual(["indexed"]);
  expect(routedSources).toEqual(["index"]);
});

it("refuses only the check that reads the working tree, with a remedy that keeps the checks in force", async () => {
  const { run, executed, routedSources } = await partlyStaged(["native", "indexed", "routed"], "configured");
  const result = await run();
  expect(result).toMatchObject({ kind: "error", exitCode: 2, error: { kind: "refused",
    message: expect.stringContaining("\"src/a.ts\" (checks: native).") } });
  const message = result.kind === "error" ? result.error.message : "";
  expect(message).toContain("git stash push --keep-index");
  expect(message).toContain("cd \"$(git rev-parse --show-toplevel)\"");
  expect(message).toContain("git diff-tree -p --binary refs/stash^2 refs/stash | git apply --3way");
  expect(message).not.toContain("ARC_SKIP");
  expect(executed).toEqual([]);
  expect(routedSources).toEqual([]);
});

it("reads a check's runner once, so the refusal and the dispatch cannot disagree", async () => {
  const { run, executed, routedSources, runnerReads } = await partlyStaged(["routed"], "removed after the first read");
  await expect(run()).resolves.toMatchObject({ kind: "result", result: { checks: [{ id: "routed", outcome: "couldn't run" }] } });
  expect(runnerReads()).toBe(1);
  expect(routedSources).toEqual(["index"]);
  expect(executed).toEqual([]);
});

it("refuses a routed check when no runner is configured, since it then runs in the working tree", async () => {
  const { run, executed } = await partlyStaged(["indexed", "routed"], "absent");
  await expect(run()).resolves.toMatchObject({ kind: "error", error: { kind: "refused",
    message: expect.stringContaining("(checks: routed).") } });
  expect(executed).toEqual([]);
});

it("leaves a routed check whose runner configuration cannot be read to report that, rather than refusing", async () => {
  const { run, executed } = await partlyStaged(["routed"], "unreadable");
  await expect(run()).resolves.toMatchObject({ kind: "result", result: { checks: [
    { id: "routed", outcome: "couldn't run", reason: expect.stringContaining("malformed YAML") }] } });
  expect(executed).toEqual([]);
});
