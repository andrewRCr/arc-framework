/** Faithful public closing boundaries preserve diagnostics and nonzero process status. */
import { expect, it } from "vitest";
import { closeVitestController } from "../../src/lib/vitest-closing.js";

type Controller = Parameters<typeof closeVitestController>[0];

function controllerFixture(fault: string): { controller: Controller; output: string[] } {
  const output: string[] = [];
  let closed = false;
  const controller: Controller = {
    logger: {
      error(...values: unknown[]) { output.push(values.map(String).join(" ")); },
      printError(error) { output.push(String(error)); },
      printUnhandledErrors(errors) { for (const error of errors) output.push(String(error)); },
    },
    state: { getUnhandledErrors() {
      if (!closed) throw new Error("final state inspected before closing");
      return fault.includes("worker") ? [new Error("late worker failure")] : [];
    } },
    async close() {
      closed = true;
      if (fault.includes("logged")) controller.logger.error("native cleanup", { toString: () => "detail retained" });
      if (fault.includes("rejected")) throw new Error("rejected close retained");
    },
  };
  return { controller, output };
}

it.each(["logged", "worker", "rejected", "rejected worker"])("fails %s closing without losing diagnostics", async (fault) => {
  const previous = process.exitCode;
  const { controller, output } = controllerFixture(fault);
  const logger = controller.logger.error;
  try {
    process.exitCode = 0;
    await closeVitestController(controller);
    expect(process.exitCode).toBe(1);
    expect(output.join("\n")).toContain(fault.includes("rejected") ? "rejected close retained"
      : fault === "logged" ? "native cleanup detail retained" : "late worker failure");
    if (fault.includes("worker")) expect(output.join("\n")).toContain("late worker failure");
    expect(controller.logger.error).toBe(logger);
    controller.logger.error("after close");
    expect(output.at(-1)).toBe("after close");
  } finally { process.exitCode = previous; }
});

it("retains the original thrown failure and its existing status when closing also fails", async () => {
  const previous = process.exitCode;
  const { controller, output } = controllerFixture("rejected worker");
  const original = new Error("original setup failure");
  try {
    process.exitCode = 42;
    let caught: unknown;
    try { try { throw original; } finally { await closeVitestController(controller); } }
    catch (error) { caught = error; }
    expect(caught).toBe(original);
    expect(process.exitCode).toBe(42);
    expect(output.join("\n")).toContain("late worker failure");
    expect(output.join("\n")).toContain("rejected close retained");
  } finally { process.exitCode = previous; }
});

it("permits clean closing without clearing an existing native status", async () => {
  const previous = process.exitCode;
  const { controller, output } = controllerFixture("clean");
  try {
    for (const status of [0, 42]) {
      process.exitCode = status;
      await closeVitestController(controller);
      expect(process.exitCode).toBe(status);
    }
    expect(output).toEqual([]);
  } finally { process.exitCode = previous; }
});
