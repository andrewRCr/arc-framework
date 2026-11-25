/** Native child exit bits survive the actual prepared transport and native process boundary. */
import { afterEach, expect, it } from "vitest";
import { selectedExecutionFixture } from "../fixtures/checks/prepared-execution.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";
import { runCheckProcess } from "../../src/lib/checks/process.js";
import { normalizeCheckInvocationOutcome, reduceCheckInvocationOutcomes } from "../../src/lib/checks/result.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });
const statuses = [7, 256, 0x80000000, 0xc0000005, 0xffffffff];
const nativeStatus = (code: number) => process.platform === "win32" ? code : code % 256;

it.each(statuses)("preserves actual native exit bits for child status %d", async code => {
  const fixture = await selectedExecutionFixture(directories, "execute");
  const command = [process.execPath, "-e", `process.exit(${code})`];
  const prepared = await prepareSelectedCheckExecution({ ...fixture.input, check: { ...fixture.input.check,
    mode: "project", command } }, fixture.io);
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  const execution = prepared.execution;
  try {
    const invocation = execution.plan.invocations[0];
    if (invocation === undefined) throw new Error("Expected a fixed invocation");
    const result = await execution.run(invocation.id);
    expect(result.status).toBe("settled");
    expect(result.outcomes.get(invocation.id)).toEqual({ status: "completed", exitCode: nativeStatus(code) });
    expect((await runCheckProcess(command, fixture.root)).exitCode).toBe(nativeStatus(code));
    const normalized = normalizeCheckInvocationOutcome(result.outcomes.get(invocation.id));
    expect(reduceCheckInvocationOutcomes([normalized]).kind).toBe(nativeStatus(code) === 0 ? "success" : "failure");
  } finally { await execution.close(); }
});

it.each(statuses)("keeps actual child status %d beside missing work after transport loss", async code => {
  const fixture = await selectedExecutionFixture(directories, "group-loss");
  const prepared = await prepareSelectedCheckExecution({ ...fixture.input,
    buildPlan: () => ({ invocations: [code, 0].map((status, index) => ({ id: `native:${index}`, cwd: ".", shell: false,
      argv: [process.execPath, "-e", `process.exit(${status})`] })), probes: { global: [], check: [] } }),
  }, fixture.io);
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  const execution = prepared.execution;
  try {
    const result = await execution.runGroup(["native:0", "native:1"]);
    expect(result.status).toBe("incomplete");
    expect(result.outcomes.get("native:0")).toEqual({ status: "completed", exitCode: nativeStatus(code) });
    expect(result.outcomes.has("native:1")).toBe(false);
    const reduced = reduceCheckInvocationOutcomes([normalizeCheckInvocationOutcome(result.outcomes.get("native:0")),
      normalizeCheckInvocationOutcome(result.outcomes.get("native:1"))]);
    expect(reduced.kind).toBe(nativeStatus(code) === 0 ? "unavailable" : "failure");
    expect(reduced.incomplete).not.toHaveLength(0);
    if (nativeStatus(code) !== 0) expect(reduced.exitCode).toBe(nativeStatus(code));
    expect((await execution.close()).status).toBe("uncertain");
  } finally { await execution.close(); }
});
