/** Runtime-free failure composition preserves original errors through controller cleanup. */
import { expect, it } from "vitest";
import { executeVitestSelection } from "../../src/lib/vitest-execution.js";
import { makeVitestControllerFake } from "../helpers/vitest-controller-fake.js";

it("preserves execution failure and cleanup diagnostics without preparing a runtime", async () => {
  const previous = process.exitCode;
  const original = new Error("original collection failure retained");
  const fake = makeVitestControllerFake([], { executionError: original,
    closingDiagnostic: "native teardown failure retained", closingError: new Error("closing rejection retained") });
  try {
    process.exitCode = 0;
    await expect(executeVitestSelection({ controller: fake.controller, specifications: [], requiresRuntime: false },
      { cwd: "absent-checkout", packageRoot: "absent-runtime", env: {}, tier: "unit" },
      () => { throw new Error("capture must not run after execution failure"); })).rejects.toBe(original);
    expect(process.exitCode).toBe(1);
    expect(fake.events).toEqual(["executed", "closed"]);
    expect(fake.diagnostics.join("\n")).toContain("native teardown failure retained");
    expect(fake.diagnostics.join("\n")).toContain("closing rejection retained");
  } finally { process.exitCode = previous; }
});
