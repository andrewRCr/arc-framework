/** Real binary frames, native signals and both closure arms use the same public validators. */
import { afterEach, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRunnerCheckRepository } from "../fixtures/checks/runner.js";
import { preparedAdapterScript } from "../fixtures/checks/prepared-execution.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";
import { startCheckRunnerProcess, type CheckRunnerProcessExit } from "../../src/lib/checks/runner/session-process.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });
const localIt = it.runIf(process.platform === "linux");

localIt("preserves arbitrary output bytes in bounded frames before normal context release", async () => {
  const fixture = await createRunnerCheckRepository(directories);
  const chunks: Buffer[] = [];
  const expected = Buffer.alloc(192 * 1024, Buffer.from([0, 255, 13, 10]));
  const prepared = await prepareSelectedCheckExecution({ ...fixture.input,
    buildPlan: () => ({ invocations: [{ id: "binary", cwd: ".", shell: false,
      argv: [process.execPath, "-e", "process.stdout.write(Buffer.alloc(192*1024,Buffer.from([0,255,13,10])))"] }],
    probes: { global: [], check: [] } }), onOutput: output => { chunks.push(Buffer.from(output.bytes)); },
  }, fixture.io);
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  try {
    const result = await prepared.execution.run("binary");
    expect(result.status).toBe("settled");
    expect(result.outcomes.get("binary")).toEqual({ status: "completed", exitCode: 0 });
    const actual = Buffer.concat(chunks);
    expect(actual.length).toBe(expected.length);
    expect(createHash("sha256").update(actual).digest("hex")).toBe(createHash("sha256").update(expected).digest("hex"));
    expect(chunks.every(chunk => chunk.length <= 65536)).toBe(true);
    await expect(prepared.execution.close()).resolves.toMatchObject({ status: "closed", exit: { started: true, exitCode: 0 } });
    for (const directory of fixture.captures) await expect(access(directory)).rejects.toThrow();
  } finally { await prepared.execution.close(); }
});

localIt.each([["SIGTERM", 143], ["SIGKILL", 137]] as const)("preserves a native %s child status through normal release", async (signal, code) => {
  const fixture = await createRunnerCheckRepository(directories);
  const prepared = await prepareSelectedCheckExecution({ ...fixture.input,
    buildPlan: () => ({ invocations: [{ id: "signal", cwd: ".", shell: false,
      argv: [process.execPath, "-e", `process.kill(process.pid,${JSON.stringify(signal)})`] }], probes: { global: [], check: [] } }),
  }, fixture.io);
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  try {
    const result = await prepared.execution.run("signal");
    expect(result.status).toBe("settled");
    expect(result.outcomes.get("signal")).toEqual({ status: "completed", exitCode: code });
    await expect(prepared.execution.close()).resolves.toMatchObject({ status: "closed", exit: { exitCode: 0 } });
  } finally { await prepared.execution.close(); }
});

it("drains a settled unavailable preparation to exit zero, removes captures and permits a fresh retry", async () => {
  const fixture = await createRunnerCheckRepository(directories);
  const executable = join(fixture.stateRoot, "unavailable.cjs");
  await writeFile(executable, preparedAdapterScript("unavailable"));
  let processExit: Promise<CheckRunnerProcessExit> | undefined;
  const result = await prepareSelectedCheckExecution({ ...fixture.input,
    configuration: { ...fixture.input.configuration, argv: [process.execPath, executable] },
  }, { ...fixture.io, launch: input => {
    const port = startCheckRunnerProcess(input);
    processExit = port.completed;
    return port;
  } });
  expect(result).toMatchObject({ status: "unavailable", reason: "No compatible placement" });
  expect(processExit).toBeDefined();
  expect(await processExit).toEqual({ started: true, exitCode: 0 });
  for (const directory of fixture.captures) await expect(access(directory)).rejects.toThrow();
  const repaired = await prepareSelectedCheckExecution({ ...fixture.input,
    configuration: { ...fixture.input.configuration, argv: [process.execPath, "-e", preparedAdapterScript("execute")] },
  }, fixture.io);
  if (repaired.status !== "ready") throw new Error(repaired.reason);
  try {
    expect((await repaired.execution.run(repaired.execution.plan.invocations[0]!.id)).status).toBe("settled");
    await expect(repaired.execution.close()).resolves.toMatchObject({ status: "closed" });
  } finally { await repaired.execution.close(); }
});
