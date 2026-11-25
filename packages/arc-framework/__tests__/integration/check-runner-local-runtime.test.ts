/** Actual Node qualification retains unknown probe failures and refuses changed bindings before execution. */
import { afterEach, expect, it } from "vitest";
import { access, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { selectedExecutionFixture } from "../fixtures/checks/prepared-execution.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { prepareSelectedCheckExecution, type PrepareSelectedCheckExecutionInput } from "../../src/lib/checks/runner/execution.js";

const example = fileURLToPath(new URL("../../examples/check-runner/local.mjs", import.meta.url));
const directories: string[] = [];
const localIt = it.runIf(process.platform === "linux");
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

localIt.each(["nonzero", "invalid UTF-8"])("keeps %s probe qualification unknown while allowing live execution", async fault => {
  const fixture = await selectedExecutionFixture(directories);
  const prepared = await prepareSelectedCheckExecution({ ...fixture.input,
    configuration: { file: fixture.input.configuration.file,
      argv: [process.execPath, example, "--known-node-runtime", "--state-root", join(fixture.root, "adapter.secret")] },
    globalRuntimeInputs: [[process.execPath, "-e", fault === "nonzero" ? "process.exit(19)" : "process.stdout.write(Buffer.from([255]))"]],
  }, fixture.io);
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  try {
    expect(prepared.execution.runtime).toBeUndefined();
    const result = await prepared.execution.run(prepared.execution.plan.invocations[0]!.id);
    expect([...result.outcomes.values()]).toEqual([{ status: "completed", exitCode: 0 }]);
  } finally { await prepared.execution.close(); }
});

localIt("refuses changed actual probe qualification before the check child and requires a fresh explicit attempt", async () => {
  const fixture = await selectedExecutionFixture(directories);
  const generation = join(fixture.root, "generation.secret");
  const marker = join(fixture.root, "executed.secret");
  await writeFile(generation, "first environment");
  const input: PrepareSelectedCheckExecutionInput = { ...fixture.input,
    configuration: { file: fixture.input.configuration.file,
      argv: [process.execPath, example, "--known-node-runtime", "--state-root", join(fixture.root, "adapter.secret")] },
    globalRuntimeInputs: [[process.execPath, "-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(generation)}))`]],
    check: { ...fixture.input.check, command: [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)},'executed')`] },
  };
  const attempt = prepareSelectedCheckExecution(input, fixture.io);
  const first = await attempt;
  if (first.status !== "ready") throw new Error(first.reason);
  try {
    expect(first.execution.runtime).toBeDefined();
    await writeFile(generation, "second environment");
    const result = await first.execution.run(first.execution.plan.invocations[0]!.id);
    expect(result.status).toBe("settled");
    expect([...result.outcomes.values()]).toMatchObject([{ status: "unavailable", reason: expect.stringContaining("runtime changed") }]);
    await expect(access(marker)).rejects.toThrow();
  } finally { await first.execution.close(); }
  const retry = prepareSelectedCheckExecution(input, fixture.io);
  expect(retry.planId).not.toBe(attempt.planId);
  const repaired = await retry;
  if (repaired.status !== "ready") throw new Error(repaired.reason);
  try {
    const result = await repaired.execution.run(repaired.execution.plan.invocations[0]!.id);
    expect([...result.outcomes.values()]).toEqual([{ status: "completed", exitCode: 0 }]);
    await expect(access(marker)).resolves.toBeUndefined();
  } finally { await repaired.execution.close(); }
});
