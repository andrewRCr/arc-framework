/** Unit tests for the in-process Vitest adapter used by local heavy-test admission. */

import { describe, expect, it, vi } from "vitest";

import { runLocalVitestTier } from "../../src/lib/local-vitest-runner.js";

describe("runLocalVitestTier", () => {
  it.each([
    ["full", []],
    ["integration", ["--project", "integration"]],
    ["e2e", ["--project", "e2e"]],
    ["e2e-focused", ["--project", "e2e"]],
  ] as const)("runs the %s tier through the current Vitest controller process", async (tier, projectArgs) => {
    const exit = vi.fn(async () => {});
    const parseCli = vi.fn(() => ({ filter: ["filtered.test.ts"], options: { run: true } }));
    const start = vi.fn(async () => ({ shouldKeepServer: () => false, exit }));

    await runLocalVitestTier(tier, ["filtered.test.ts", "--passWithNoTests=false"], { parseCli, start });

    expect(parseCli).toHaveBeenCalledWith([
      "vitest",
      "run",
      ...projectArgs,
      "filtered.test.ts",
      "--passWithNoTests=false",
    ]);
    expect(start).toHaveBeenCalledWith("test", ["filtered.test.ts"], { run: true });
    expect(exit).toHaveBeenCalledOnce();
  });

  it("does not terminate a controller that intentionally keeps its server", async () => {
    const exit = vi.fn(async () => {});

    await runLocalVitestTier("full", [], {
      parseCli: () => ({ filter: [], options: { run: true } }),
      start: async () => ({ shouldKeepServer: () => true, exit }),
    });

    expect(exit).not.toHaveBeenCalled();
  });
});
