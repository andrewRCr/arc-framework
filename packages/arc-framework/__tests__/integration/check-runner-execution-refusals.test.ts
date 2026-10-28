/** Readiness and retention follow validated captured inputs rather than adapter claims alone. */
import { afterEach, expect, it } from "vitest";
import { access } from "node:fs/promises";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";
import { selectedExecutionFixture, preparedAdapterScript } from "../fixtures/checks/prepared-execution.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.each(["source-bytes", "manifest", "environment"] as const)("refuses changed %s before granting ready and permits a repaired fresh attempt", async mode => {
  const fixture = await selectedExecutionFixture(directories, mode);
  const refused = await prepareSelectedCheckExecution(fixture.input, fixture.io);
  if (refused.status === "ready") await refused.execution.close();
  expect(refused.status).toBe("unavailable");
  for (const directory of fixture.captures) await expect(access(directory)).rejects.toThrow();
  const repaired = await prepareSelectedCheckExecution({ ...fixture.input,
    configuration: { ...fixture.input.configuration, argv: [process.execPath, "-e", preparedAdapterScript("unknown")] } }, fixture.io);
  expect(repaired.status).toBe("ready");
  if (repaired.status !== "ready") throw new Error(repaired.reason);
  await expect(repaired.execution.close()).resolves.toMatchObject({ status: "closed" });
});

it("retains capture and recovery when preparation disappears after starting", async () => {
  const fixture = await selectedExecutionFixture(directories, "disappeared");
  const result = await prepareSelectedCheckExecution(fixture.input, fixture.io);
  if (result.status === "ready") await result.execution.close();
  expect(result.status).toBe("uncertain");
  if (result.status !== "uncertain") throw new Error("Expected uncertain preparation");
  expect(result.retained.recovery).toBe("Inspect and settle this test attempt by its plan UUID.");
  expect(result.retained.planId).toMatch(/^[0-9a-f-]{36}$/u);
  await expect(access(result.retained.sourceRoot)).resolves.toBeUndefined();
  for (const path of result.retained.environmentFiles) await expect(access(path)).resolves.toBeUndefined();
});

it("cleans captured inputs after settled preparation unavailability", async () => {
  const fixture = await selectedExecutionFixture(directories, "unavailable");
  const result = await prepareSelectedCheckExecution(fixture.input, fixture.io);
  expect(result).toMatchObject({ status: "unavailable", reason: "No compatible placement", remedy: "Repair adapter placement and retry." });
  expect(fixture.captures.length).toBeGreaterThan(0);
  for (const directory of fixture.captures) await expect(access(directory)).rejects.toThrow();
});

it("qualifies every invocation and exact requested probe output before reusable readiness", async () => {
  const fixture = await selectedExecutionFixture(directories, "known");
  const result = await prepareSelectedCheckExecution(fixture.input, fixture.io);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error(result.reason);
  try {
    expect(result.execution.runtime?.size).toBe(result.execution.plan.invocations.length);
    for (const invocation of result.execution.plan.invocations) {
      const runtime = result.execution.runtime?.get(invocation.id);
      expect(runtime?.identity).toBe(`sha256:${"b".repeat(64)}`);
      for (const probe of [...result.execution.plan.probes.global, ...result.execution.plan.probes.check]) {
        expect(runtime?.probes.get(probe.id)).toBe(` \n${probe.id}\r\n`);
      }
    }
  } finally { await result.execution.close(); }
});

it.each(["missing-runtime", "bad-source-claim"] as const)("refuses malformed ready claims and retains uncertainty: %s", async mode => {
  const fixture = await selectedExecutionFixture(directories, mode);
  const result = await prepareSelectedCheckExecution(fixture.input, fixture.io);
  if (result.status === "ready") await result.execution.close();
  expect(result.status).toBe("uncertain");
  if (result.status !== "uncertain") throw new Error("Expected retained failed preparation");
  expect(result.retained.recovery).toBeDefined();
  await expect(access(result.retained.sourceRoot)).resolves.toBeUndefined();
});
