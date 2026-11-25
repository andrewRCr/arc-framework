/** Captured key reads remain independent of the caller and preserve the prepared execution context. */
import { afterEach, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { copyFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRunnerCheckRepository } from "../fixtures/checks/runner.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { resolveCheckKeyMaterial } from "../../src/lib/checks/key-resolver.js";
import { createExecaGitExecInput } from "../../src/lib/git/process-executor.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";
import { composePreparedCheckKey } from "../../src/lib/checks/runner/key.js";
import { planCheckExecution } from "../../src/lib/checks/runner/planning.js";
import { resolveCheckRequest } from "../../src/lib/checks/resolve-request.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.runIf(process.platform === "linux")("reads scoped material after caller removal without changing prepared execution", async () => {
  const fixture = await createRunnerCheckRepository(directories);
  const definition = CheckDeclarationSchema.parse({ global_inputs: ["check.cjs"], global_runtime_inputs: [["forbidden-local-probe"]],
    checks: { example: { ...fixture.input.check, shards: { count: 2, argument: "--shard={index}/{count}", routed: true }, inputs: ["input.txt"], runtime_inputs: [["forbidden-local-probe"]] } } });
  const check = definition.checks.example!;
  const prepared = await prepareSelectedCheckExecution({ ...fixture.input, check }, fixture.io);
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  try {
    await removeGitBackedDirs([fixture.root]);
    const io = { ...fixture.io, gitInput: createExecaGitExecInput(),
      capturedSource: { root: prepared.execution.source.root, index: prepared.execution.sourceIndex },
      runtime: async (): Promise<never> => { throw new Error("Caller-local probing is forbidden"); } };
    const material = await resolveCheckKeyMaterial(io, { id: "example", check, definition,
      root: fixture.root, tree: fixture.input.request.tree, paths: ["input.txt"],
      ...(fixture.input.request.source.head.status === "known" ? { base: fixture.input.request.source.head.commit } : {}) });
    expect(material).not.toBeNull();
    expect(material?.inputs.map(entry => entry.path)).toEqual(["input.txt"]);
    expect(material?.materializedInputs?.map(entry => entry.path)).toEqual(["check.cjs", "input.txt"]);
    expect(material?.materializedInputs?.find(entry => entry.path === "input.txt")?.entry).toMatchObject({
      kind: "file", digest: `sha256:${createHash("sha256").update("captured source\r\n").digest("hex")}`,
    });
    const result = await prepared.execution.run(prepared.execution.plan.invocations[0]!.id);
    expect([...result.outcomes.values()]).toEqual([{ status: "completed", exitCode: 0 }]);
    await expect(prepared.execution.close()).resolves.toMatchObject({ status: "closed" });
  } finally { await prepared.execution.close(); }
});

it.runIf(process.platform === "linux")("keys known execution independently of attempt handles, unrelated source and explicit file locations", async () => {
  const fixture = await createRunnerCheckRepository(directories);
  const definition = CheckDeclarationSchema.parse({ global_inputs: ["check.cjs"],
    global_runtime_inputs: fixture.input.globalRuntimeInputs,
    checks: { example: { ...fixture.input.check, shards: { count: 2, argument: "--shard={index}/{count}", routed: true }, inputs: ["input.txt"] } } });
  const check = definition.checks.example!;
  const key = async (renamed: boolean, file: string, scalar = "literal\nvalue") => {
    const resolved = await resolveCheckRequest(fixture.io.git, fixture.root, { form: { kind: "run", ids: ["example"] } });
    if (resolved.status !== "resolved") throw new Error(resolved.message);
    const prepared = await prepareSelectedCheckExecution({ ...fixture.input, request: resolved.request, check,
      environment: { EXPLICIT_FILE: file, SCALAR: scalar },
      configuration: { ...fixture.input.configuration, argv: [...fixture.input.configuration.argv, "--known-node-runtime"] },
      ...(renamed ? { buildPlan: async context => {
        const plan = await planCheckExecution({ ...fixture.input, check, source: context.source, paths: context.paths });
        return { ...(plan.coordinates === undefined ? {} : { coordinates: plan.coordinates }), invocations: plan.invocations.map((invocation, index) => ({ ...invocation, id: `other-invocation:${index}` })),
          probes: { global: plan.probes.global.map((probe, index) => ({ ...probe, id: `other-global:${index}` })),
            check: plan.probes.check.map((probe, index) => ({ ...probe, id: `other-check:${index}` })) } };
      } } : {}) }, fixture.io);
    if (prepared.status !== "ready") throw new Error(prepared.reason);
    try {
      expect(prepared.execution.runtime).toBeDefined();
      const material = await resolveCheckKeyMaterial({ ...fixture.io, gitInput: createExecaGitExecInput(),
        capturedSource: { root: prepared.execution.source.root, index: prepared.execution.sourceIndex } },
      { id: "example", check, definition, root: fixture.root, tree: resolved.request.tree, paths: ["input.txt"] });
      const result = composePreparedCheckKey(material, prepared.execution);
      expect(result).toMatch(/^[0-9a-f]{64}$/u);
      await expect(prepared.execution.close()).resolves.toMatchObject({ status: "closed" });
      return result;
    } finally { await prepared.execution.close(); }
  };
  const first = await key(false, "input.secret");
  await copyFile(join(fixture.root, "input.secret"), join(fixture.root, "moved.secret"));
  await writeFile(join(fixture.root, "docs/b.md"), "unrelated projection\n");
  expect(await key(true, "moved.secret")).toBe(first);
  await writeFile(join(fixture.root, "moved.secret"), "changed explicit bytes");
  expect(await key(true, "moved.secret")).not.toBe(first);
  expect(await key(true, "input.secret", "changed scalar")).not.toBe(first);
}, 30_000);
