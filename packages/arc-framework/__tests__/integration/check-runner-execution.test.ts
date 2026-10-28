/** Selected execution preparation composes real source capture and one adapter conversation. */
import { afterEach, expect, it } from "vitest";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { removeGitBackedDir, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";
import { selectedExecutionFixture } from "../fixtures/checks/prepared-execution.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it("prepares fixed source and explicit bindings, then removes them only after cache-hit release", async () => {
  const { root, input, io } = await selectedExecutionFixture(directories);
  const prepared = await prepareSelectedCheckExecution(input, io);
  expect(prepared.status).toBe("ready");
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  const execution = prepared.execution;
  try {
    expect(execution.plan.invocations[0]?.argv).toEqual([process.execPath, "check.cjs", "input.txt"]);
    expect(execution.plan.probes.global).toHaveLength(1);
    expect(execution.runtime).toBeUndefined();
    expect(execution.supportsRunGroup).toBe(false);
    expect(execution.planId).toMatch(/^[0-9a-f-]{36}$/u);
    const explicit = execution.environment.EXPLICIT_FILE;
    if (explicit?.kind !== "file" || explicit.state !== "file") throw new Error("Expected frozen explicit file");
    await removeGitBackedDir(root);
    expect(await readFile(join(execution.source.root, "input.txt"), "utf8")).toBe("captured source\r\n");
    expect(await readFile(explicit.path)).toEqual(Buffer.from([0, 255, 13, 10]));
    expect(execution.sourceIndex.read("input.txt")).toMatchObject({ status: "present" });
    await expect(execution.close()).resolves.toMatchObject({ status: "closed" });
    await expect(access(execution.source.root)).rejects.toThrow();
    await expect(access(explicit.path)).rejects.toThrow();
  } finally { await execution.close(); }
});
