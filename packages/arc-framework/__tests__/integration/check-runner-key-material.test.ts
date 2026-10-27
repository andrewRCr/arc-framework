/** Captured key reads remain independent of the caller and preserve the prepared execution context. */
import { afterEach, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createRunnerCheckRepository } from "../fixtures/checks/runner.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { resolveCheckKeyMaterial } from "../../src/lib/checks/key-resolver.js";
import { createExecaGitExecInput } from "../../src/lib/git/process-executor.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.runIf(process.platform === "linux")("reads scoped material after caller removal without changing prepared execution", async () => {
  const fixture = await createRunnerCheckRepository(directories);
  const definition = CheckDeclarationSchema.parse({ global_inputs: ["check.cjs"], global_runtime_inputs: [["forbidden-local-probe"]],
    checks: { example: { ...fixture.input.check, inputs: ["input.txt"], runtime_inputs: [["forbidden-local-probe"]] } } });
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
