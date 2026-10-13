/** Unit coverage for measuring a named ref through that commit's own capture entry. */

import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { measureTestCostAtRef, type TestCostRefDependencies } from "../../src/lib/test-cost/ref.js";

const top = "/repo";
const packageRoot = "/repo/packages/arc-framework";
const temporary = "/tmp/arc-test-cost-ref-x";
const checkout = join(temporary, "checkout");
const commit = "a".repeat(40);
const mode = { condition: "tier-isolated", projectSet: "integration", workerSizing: "12" } as const;
const outputPath = "/repo/packages/arc-framework/.test-cost-runs/run.json";

interface Fake {
  readonly dependencies: TestCostRefDependencies;
  readonly events: string[];
}

function fake(overrides: {
  readonly resolves?: boolean;
  readonly lockAtRef?: string;
  readonly captureExitCode?: number;
  readonly captureStdout?: string;
  readonly retainedSchema?: number;
} = {}): Fake {
  const events: string[] = [];
  const dependencies: TestCostRefDependencies = {
    git: async (args) => {
      events.push(`git ${args.join(" ")}`);
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return top;
      if (args[0] === "hash-object") return "lock-blob";
      if (args[0] === "rev-parse" && args.at(-1) === `${commit}:package-lock.json`) {
        return overrides.lockAtRef ?? "lock-blob";
      }
      if (args[0] === "rev-parse") {
        if (overrides.resolves === false) throw new Error("fatal: Needed a single revision");
        return commit;
      }
      return "";
    },
    readText: async (path) => {
      if (path === outputPath) return JSON.stringify({ schemaVersion: overrides.retainedSchema ?? 5 });
      throw new Error(`unexpected read ${path}`);
    },
    exists: async () => true,
    makeTemporaryDirectory: async () => temporary,
    link: async (target, path) => { events.push(`link ${path} -> ${target}`); },
    remove: async (path) => { events.push(`remove ${path}`); },
    runCapture: async (cwd, args) => {
      events.push(`capture ${cwd} ${args.join(" ")}`);
      return {
        exitCode: overrides.captureExitCode ?? 0,
        stdout: overrides.captureStdout ?? JSON.stringify({ outputPath, wallClockMs: 1234 }),
      };
    },
  };
  return { dependencies, events };
}

const input = { packageRoot, ref: "main", mode, outputPath, env: {} };

describe("measureTestCostAtRef", () => {
  it("runs the ref's own capture entry in a detached checkout and removes the checkout", async () => {
    const { dependencies, events } = fake();

    const result = await measureTestCostAtRef(input, dependencies);

    expect(result).toEqual({
      ref: { name: "main", commit },
      summary: { outputPath, wallClockMs: 1234 },
    });
    expect(events).toContain(
      `git -c core.hooksPath=${join(temporary, "no-hooks")} worktree add --detach ${checkout} ${commit}`,
    );
    expect(events).toContain(`link ${join(checkout, "node_modules")} -> ${join(top, "node_modules")}`);
    expect(events).toContain(
      `link ${join(checkout, "packages/arc-framework/node_modules")} -> ${join(packageRoot, "node_modules")}`,
    );
    expect(events).toContain(`capture ${join(checkout, "packages/arc-framework")} --condition tier-isolated `
      + `--project-set integration --workers 12 --output ${outputPath}`);
    expect(events.indexOf(`git worktree remove --force ${checkout}`))
      .toBeGreaterThan(events.findIndex((event) => event.startsWith("capture ")));
    expect(events).toContain(`remove ${temporary}`);
  });

  it("refuses an unresolvable ref before creating a checkout", async () => {
    const { dependencies, events } = fake({ resolves: false });

    await expect(measureTestCostAtRef({ ...input, ref: "missing" }, dependencies))
      .rejects.toThrow(/Cannot resolve missing to a commit/u);
    expect(events.some((event) => event.includes("worktree add"))).toBe(false);
  });

  it("refuses a ref whose dependency lockfile differs before creating a checkout", async () => {
    const { dependencies, events } = fake({ lockAtRef: "older-lock-blob" });

    await expect(measureTestCostAtRef(input, dependencies)).rejects.toThrow(/package-lock\.json differs/u);
    expect(events.some((event) => event.includes("worktree add"))).toBe(false);
  });

  it("refuses a capture entry that predates schema v5 and still removes the checkout", async () => {
    const { dependencies, events } = fake({ retainedSchema: 4 });

    await expect(measureTestCostAtRef(input, dependencies)).rejects.toThrow(/schema v5/u);
    expect(events).toContain(`git worktree remove --force ${checkout}`);
    expect(events).toContain(`remove ${temporary}`);
  });

  it("refuses a capture entry whose summary is not JSON and still removes the checkout", async () => {
    const { dependencies, events } = fake({ captureStdout: "Wall clock: 1234 ms" });

    await expect(measureTestCostAtRef(input, dependencies)).rejects.toThrow(/schema v5/u);
    expect(events).toContain(`git worktree remove --force ${checkout}`);
  });

  it("removes the checkout when the capture fails", async () => {
    const { dependencies, events } = fake({ captureExitCode: 1 });

    await expect(measureTestCostAtRef(input, dependencies)).rejects.toThrow(/capture at main/u);
    expect(events).toContain(`git worktree remove --force ${checkout}`);
    expect(events).toContain(`remove ${temporary}`);
  });
});
