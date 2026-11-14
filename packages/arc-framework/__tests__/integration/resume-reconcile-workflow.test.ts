/**
 * Contract coverage for resume's reconcile step.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { softWrappedPattern, softWrappedProse } from "../helpers/soft-wrapped-prose.js";

const root = resolve(import.meta.dirname, "../../../..");

async function readRepositoryFile(path: string): Promise<string> {
  return readFile(resolve(root, path), "utf8");
}

describe("resume current-WU reconcile ceremony", () => {
  it("reconciles from the work unit's own checkout after the pause clears, committing nothing", async () => {
    const [packaged, installed] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/resume-work-unit.md"),
      readRepositoryFile(".arc/system/workflows/arc/work-unit-lifecycle/resume-work-unit.md"),
    ]);

    expect(installed).toBe(packaged);
    const materialize = packaged.indexOf("arc materialize {name}");
    const resume = packaged.indexOf("arc resume {name}\n");
    const reconcile = packaged.indexOf("arc wu reconcile {name} --apply --json");

    expect(materialize).toBeGreaterThanOrEqual(0);
    expect(resume).toBeGreaterThan(materialize);
    expect(reconcile).toBeGreaterThan(resume);
    expect(packaged).toMatch(softWrappedPattern(/fresh\s+worktree\s+reported\s+by\s+`arc materialize`[\s\S]*arc wu reconcile/u));
    expect(packaged).not.toContain("--attach-session");
    expect(packaged).not.toContain("chore(arc): resume {name}");
    expect(packaged).not.toContain("chore(arc): reconcile {name} after resume");
    expect(packaged).toMatch(softWrappedProse("`clean` — continue without a write, stage, or commit."));
    expect(packaged).toMatch(softWrappedPattern(/`conflict`[\s\S]*pause\s+is\s+already\s+cleared/u));
  });
});
