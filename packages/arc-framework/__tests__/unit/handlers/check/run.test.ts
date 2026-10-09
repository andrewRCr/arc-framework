/** Check scheduling is observable through outcomes returned by the execution boundary. */
import { afterEach, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckDeclarationSchema } from "../../../../src/lib/checks/declaration.js";
import { runDeclaredRequest, type DeclaredCheckDependencies } from "../../../../src/handlers/check/run.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture(checks: Record<string, { fixes?: boolean }>, failSecondTreeWrite = false) {
  const root = await mkdtemp(join(tmpdir(), "arc-check-scheduling-"));
  roots.push(root);
  await mkdir(join(root, ".git"));
  const header = Buffer.alloc(12);
  header.write("DIRC");
  header.writeUInt32BE(2, 4);
  await writeFile(join(root, ".git/index"), Buffer.concat([header, createHash("sha1").update(header).digest()]));
  const definition = CheckDeclarationSchema.parse({ checks: Object.fromEntries(Object.entries(checks).map(([id, check]) =>
    [id, { command: [id], cache: false, inputs: [], ...check }])) });
  const git = scriptGitExec([
    { match: ["rev-parse", "--verify", "--end-of-options", "HEAD^{commit}"], responses: [{ stdout: "a".repeat(40), stderr: "" }] },
    { match: ["rev-parse", "--git-path", "index"], responses: [{ stdout: join(root, ".git/index"), stderr: "" }] },
    { match: ["add", "-A"], responses: [{ stdout: "", stderr: "" }] },
    { match: ["write-tree"], responses: failSecondTreeWrite
      ? [{ stdout: "b".repeat(40) }, { failure: { exitCode: 128, stderr: "index write failed" } }]
      : [{ stdout: "b".repeat(40), stderr: "" }] },
    { match: ["update-index", "--refresh"], responses: [{ stdout: "" }] },
    { match: ["ls-files", "--others", "--exclude-standard", "-z"], responses: [{ stdout: "" }] },
    { match: { prefix: ["rev-parse"] }, responses: [{ failure: { exitCode: 128, stderr: "missing automatic base" } }] },
  ]).exec;
  const completed: string[] = [];
  let active = 0;
  const io: DeclaredCheckDependencies & { availableParallelism: () => number } = {
    platform: "linux", availableParallelism: () => 2, git, gitInput: async () => "c".repeat(40),
    passes: { get: async () => null, put: async () => undefined },
    readDeclaration: async () => ({ status: "valid", location: ".arc/system/arc-checks.yml", value: definition }),
    runtime: async () => ({ exitCode: 0, stdout: "" }),
    execute: async command => {
      const output = JSON.stringify({ completed: [...completed], active: ++active });
      await Promise.resolve();
      active--;
      completed.push(command[0]!);
      return { started: true, exitCode: 0, output };
    },
  };
  return { root, io, ids: Object.keys(checks) };
}

it("finishes fixers serially in declaration order before ordinary checks execute", async () => {
  const { root, io, ids } = await fixture({ ordinary: {}, "fixer-one": { fixes: true }, "fixer-two": { fixes: true }, other: {} });
  const result = await runDeclaredRequest(root, io, { form: { kind: "run", ids } });
  expect(result.kind).toBe("result");
  if (result.kind !== "result") throw new Error(result.error.message);
  const outcomes = new Map(result.result.checks.map(check => [check.id, JSON.parse(check.output!)]));
  expect(outcomes.get("fixer-one")).toEqual({ completed: [], active: 1 });
  expect(outcomes.get("fixer-two")).toEqual({ completed: ["fixer-one"], active: 1 });
  expect(outcomes.get("ordinary").completed).toEqual(["fixer-one", "fixer-two"]);
});

it.each([false, true])("bounds ordinary checks by available parallelism and honors serial=%s", async serial => {
  const { root, io, ids } = await fixture({ first: {}, second: {}, third: {}, fourth: {}, fifth: {} });
  const result = await runDeclaredRequest(root, io, { form: { kind: "run", ids }, serial });
  expect(result.kind).toBe("result");
  if (result.kind !== "result") throw new Error(result.error.message);
  const concurrency = result.result.checks.map(check => (JSON.parse(check.output!) as { active: number }).active);
  expect(Math.max(...concurrency)).toBe(serial ? 1 : 2);
  expect(result.result.checks.map(check => check.id)).toEqual(ids);
  expect(result.exitCode).toBe(0);
});

it("keeps a no-op fixer's captured tree without requiring another tree write", async () => {
  const { root, io, ids } = await fixture({ format: { fixes: true } }, true);
  await expect(runDeclaredRequest(root, io, { form: { kind: "run", ids } })).resolves.toMatchObject({
    kind: "result", exitCode: 0, result: { checks: [{ id: "format", outcome: "passed" }] },
  });
});
