/** A configured adapter refuses changed qualification before launch and requires explicit retry. */
import { afterEach, expect, it } from "vitest";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { prepareSelectedCheckExecution, type PrepareSelectedCheckExecutionInput } from "../../src/lib/checks/runner/execution.js";
import { selectedExecutionFixture, preparedAdapterScript } from "../fixtures/checks/prepared-execution.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it("preserves settled drift refusal without dispatch or replacement and qualifies a fresh explicit attempt", async () => {
  const fixture = await selectedExecutionFixture(directories);
  const generation = join(fixture.root, "placement.secret");
  const marker = join(fixture.root, "executed.secret");
  await writeFile(generation, "environment-one");
  const input: PrepareSelectedCheckExecutionInput = { ...fixture.input, configuration: { ...fixture.input.configuration,
    argv: [process.execPath, "-e", preparedAdapterScript("drift", generation)] },
  buildPlan: () => ({ invocations: ["check", "sibling"].map(id => ({ id, cwd: ".", shell: false as const,
    argv: [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)},'executed')`] as [string, ...string[]] })),
  probes: { global: [], check: [] } }) };
  const first = prepareSelectedCheckExecution(input, fixture.io);
  const prepared = await first;
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  const firstRuntime = prepared.execution.runtime;
  try {
    expect(firstRuntime?.size).toBe(2);
    await writeFile(generation, "environment-two");
    for (const id of ["check", "sibling"]) {
      const result = await prepared.execution.run(id);
      expect(result.status).toBe("settled");
      expect(result.outcomes.get(id)).toMatchObject({ status: "unavailable", reason: "Prepared runtime changed" });
    }
    await expect(access(marker)).rejects.toThrow();
    expect(prepared.execution.runtime).toEqual(firstRuntime);
    await expect(prepared.execution.close()).resolves.toMatchObject({ status: "closed" });
  } finally { await prepared.execution.close(); }
  const retry = prepareSelectedCheckExecution(input, fixture.io);
  expect(retry.planId).not.toBe(first.planId);
  const repaired = await retry;
  if (repaired.status !== "ready") throw new Error(repaired.reason);
  try {
    expect(repaired.execution.runtime).toBeDefined();
    expect(repaired.execution.runtime).not.toEqual(firstRuntime);
    for (const id of ["check", "sibling"]) {
      const result = await repaired.execution.run(id);
      expect(result.outcomes.get(id)).toEqual({ status: "completed", exitCode: 0 });
    }
    expect(await readFile(marker, "utf8")).toBe("executed");
    await expect(repaired.execution.close()).resolves.toMatchObject({ status: "closed" });
  } finally { await repaired.execution.close(); }
});
