/** Prelaunch failures preserve actionable cleanup evidence without claiming remote uncertainty. */
import { afterEach, expect, it } from "vitest";
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { removeGitBackedDir, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";
import { selectedExecutionFixture, preparedAdapterScript } from "../fixtures/checks/prepared-execution.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.each(["capture-plan", "preflight"] as const)("reports failed local cleanup after %s refusal and permits repair", async fault => {
  const fixture = await selectedExecutionFixture(directories);
  const marker = join(fixture.root, "adapter-started");
  const configuration = { ...fixture.input.configuration, argv: [process.execPath, "-e",
    `require('node:fs').writeFileSync(${JSON.stringify(marker)},'started');` + preparedAdapterScript("unknown")] as [string, ...string[]] };
  const source = { ...fixture.io.source, writeManifest: async (path: string, content: string) => {
    await fixture.io.source.writeManifest(path, content);
    if (fault === "preflight") await writeFile(path, "damaged descriptor");
  }, files: { ...fixture.io.source.files, removeDirectory: async () => { throw new Error("private cleanup failure"); } } };
  const result = await prepareSelectedCheckExecution({ ...fixture.input, configuration,
    ...(fault === "capture-plan" ? { buildPlan: () => { throw new Error("private plan-builder failure"); } } : {}) }, { ...fixture.io, source });
  expect(result.status).toBe("unavailable");
  if (result.status !== "unavailable") throw new Error("Expected prelaunch refusal");
  expect(result.origin).toBe("inputs");
  await expect(access(marker)).rejects.toThrow();
  expect(result.cleanupWarning).toMatch(/remove.*manually/iu);
  expect(result.cleanupWarning).not.toContain("private cleanup failure");
  expect(result.reason).not.toContain("private plan-builder failure");
  for (const directory of fixture.captures) {
    await expect(access(directory)).resolves.toBeUndefined();
    expect(result.cleanupWarning).toContain(directory);
    await removeGitBackedDir(directory);
  }
  const repaired = await prepareSelectedCheckExecution({ ...fixture.input, configuration }, fixture.io);
  expect(repaired.status).toBe("ready");
  if (repaired.status !== "ready") throw new Error(repaired.reason);
  await repaired.execution.close();
});

it("attributes a synchronous launch refusal to the runner and releases the capture no process owns", async () => {
  const fixture = await selectedExecutionFixture(directories);
  const result = await prepareSelectedCheckExecution(fixture.input, { ...fixture.io, launch: () => {
    throw new Error("Runner requires piped stdio; repair the runner launch and retry the check request.");
  } });
  expect(result).toMatchObject({ status: "unavailable", origin: "runner", reason: expect.stringContaining("piped stdio") });
  for (const directory of fixture.captures) await expect(access(directory)).rejects.toThrow();
});
