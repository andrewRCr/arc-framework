/**
 * Tests for the cleanup that kills test-started processes by PID only while the PID still runs what the test started.
 *
 * A scripted process table stands in for the operating system's, and `process.kill` is stubbed, so a PID another
 * process has taken over is simulated without starting or ending any real process.
 */

import { afterEach, beforeEach, expect, it, vi, type MockInstance } from "vitest";

import { killOwnedProcesses, type ProcessRow } from "../../helpers/owned-processes.js";

let kill: MockInstance<typeof process.kill>;
let reports: MockInstance<typeof console.error>;

beforeEach(() => {
  kill = vi.spyOn(process, "kill").mockImplementation(() => true);
  reports = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => { vi.restoreAllMocks(); });

const census = (rows: ProcessRow[]) => async () => rows;
const mine = (command: string) => command === "mine";

it("kills a PID whose row still passes its owner check", async () => {
  await killOwnedProcesses(new Map([[101, mine]]), census([{ pid: 101, command: "mine" }]));
  expect(kill).toHaveBeenCalledExactlyOnceWith(101, "SIGKILL");
  expect(reports).not.toHaveBeenCalled();
});

it("spares and reports a PID that now runs another command", async () => {
  await killOwnedProcesses(new Map([[101, mine]]), census([{ pid: 101, command: "someone else's" }]));
  expect(kill).not.toHaveBeenCalled();
  expect(reports).toHaveBeenCalledExactlyOnceWith("DIAGNOSTIC_PID_REUSED",
    JSON.stringify({ pid: 101, command: "someone else's" }));
});

it("leaves a PID alone when the table no longer lists it or lists it as defunct", async () => {
  await killOwnedProcesses(new Map([[101, () => true], [102, () => true]]),
    census([{ pid: 102, command: "[node] <defunct>" }]));
  expect(kill).not.toHaveBeenCalled();
  expect(reports).not.toHaveBeenCalled();
});

it("kills each owned PID on its own check", async () => {
  await killOwnedProcesses(new Map([[101, mine], [102, mine], [103, mine]]), census([
    { pid: 101, command: "mine" }, { pid: 102, command: "theirs" }, { pid: 103, command: "mine" },
  ]));
  expect(kill.mock.calls).toEqual([[101, "SIGKILL"], [103, "SIGKILL"]]);
  expect(reports).toHaveBeenCalledExactlyOnceWith("DIAGNOSTIC_PID_REUSED", JSON.stringify({ pid: 102, command: "theirs" }));
});

it("tolerates a process that ends between the census and the kill", async () => {
  kill.mockImplementation(() => { throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" }); });
  await expect(killOwnedProcesses(new Map([[101, mine]]), census([{ pid: 101, command: "mine" }]))).resolves.toBeUndefined();
});

it("kills nothing and reports when the process table cannot be read", async () => {
  await killOwnedProcesses(new Map([[101, () => true]]), async () => { throw new Error("no table"); });
  expect(kill).not.toHaveBeenCalled();
  expect(reports).toHaveBeenCalledExactlyOnceWith("DIAGNOSTIC_OWNED_PROCESS_CENSUS_FAILED", "Error: no table");
});

it("reads no process table when nothing is owned", async () => {
  const table = vi.fn(async () => [] as ProcessRow[]);
  await killOwnedProcesses(new Map(), table);
  expect(table).not.toHaveBeenCalled();
});
