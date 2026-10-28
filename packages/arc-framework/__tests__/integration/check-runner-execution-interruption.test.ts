/** Real execution interruption keeps captures until child and protocol settlement. */
import { afterEach, expect, it } from "vitest";
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";
import { selectedExecutionFixture, preparedAdapterScript } from "../fixtures/checks/prepared-execution.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it("keeps execution pending after cancellation acknowledgement and refuses further dispatch", async () => {
  const fixture = await selectedExecutionFixture(directories, "cancel-run");
  const gate = join(fixture.root, "child-settle.secret");
  const forbidden = join(fixture.root, "unexpected-child.secret");
  let running!: () => void;
  const entered = new Promise<void>(resolve => { running = resolve; });
  const attempt = prepareSelectedCheckExecution({ ...fixture.input,
    buildPlan: () => ({ invocations: [
      { id: "active", cwd: ".", shell: false, argv: [process.execPath, "-e", `
        process.on('SIGTERM',()=>{});process.stdout.write('running');
        const timer=setInterval(()=>{if(require('node:fs').existsSync(${JSON.stringify(gate)})){clearInterval(timer);process.exit(0);}},10);
      `] },
      { id: "later", cwd: ".", shell: false, argv: [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(forbidden)},'started')`] },
    ], probes: { global: [], check: [] } }), onOutput: () => { running(); },
  }, fixture.io);
  const prepared = await attempt;
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  const { execution } = prepared;
  const request = execution.run("active");
  let settled = false;
  void request.then(() => { settled = true; });
  try {
    await entered;
    await expect(execution.cancel()).resolves.toEqual({ planId: attempt.planId, accepted: true });
    expect(settled).toBe(false);
    const earlyClose = await execution.close();
    expect(earlyClose.status).toBe("uncertain");
    await expect(access(execution.source.root)).resolves.toBeUndefined();
    await expect(execution.run("later")).resolves.toMatchObject({ status: "incomplete", reason: expect.stringContaining("cancelled") });
    await expect(access(forbidden)).rejects.toThrow();
  } finally {
    await writeFile(gate, "settle");
    await request;
    await execution.close();
  }
  const result = await request;
  expect(result.status).toBe("settled");
  expect(result.outcomes.get("active")).toEqual({ status: "cancelled", reason: "Child cancellation settled" });
  await expect(execution.close()).resolves.toMatchObject({ status: "closed" });
  expect(attempt.retained).toBeUndefined();
  for (const directory of fixture.captures) await expect(access(directory)).rejects.toThrow();
});

it("retains captures and pre-work recovery when a second interruption terminates pending preparation", async () => {
  const fixture = await selectedExecutionFixture(directories);
  let preparing!: () => void;
  const entered = new Promise<void>(resolve => { preparing = resolve; });
  const attempt = prepareSelectedCheckExecution({ ...fixture.input, configuration: { ...fixture.input.configuration,
    argv: [process.execPath, "-e", preparedAdapterScript("wait-prepare")] },
  onDiagnostic: () => { preparing(); } }, fixture.io);
  await entered;
  await expect(attempt.cancel()).resolves.toEqual({ planId: attempt.planId, accepted: true });
  attempt.terminate();
  const result = await attempt;
  expect(result.status).toBe("uncertain");
  if (result.status !== "uncertain") throw new Error("Termination must retain uncertain preparation");
  expect(result.retained.planId).toBe(attempt.planId);
  expect(result.retained.contextId).toBeUndefined();
  expect(result.retained.recovery).toBe("Inspect and settle this test attempt by its plan UUID.");
  await expect(access(result.retained.sourceRoot)).resolves.toBeUndefined();
});
