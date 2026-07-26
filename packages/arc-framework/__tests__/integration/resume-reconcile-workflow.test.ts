/**
 * Contract coverage for resume's two-branch reconciliation ceremony.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");

async function readRepositoryFile(path: string): Promise<string> {
  return readFile(resolve(root, path), "utf8");
}

describe("resume current-WU reconcile ceremony", () => {
  it("keeps base-pointer and dependent-meta commits on their owning branches", async () => {
    const [packaged, installed] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/resume-work-unit.md"),
      readRepositoryFile(".arc/system/workflows/arc/work-unit-lifecycle/resume-work-unit.md"),
    ]);

    expect(installed).toBe(packaged);
    const pointerCommit = packaged.indexOf("chore(arc): resume {name}");
    const inPlaceCheckout = packaged.lastIndexOf("git checkout {branch}");
    const reconcile = packaged.indexOf("arc wu reconcile {name} --apply --json");
    const dependentCommit = packaged.indexOf("chore(arc): reconcile {name} after resume");

    expect(pointerCommit).toBeGreaterThanOrEqual(0);
    expect(reconcile).toBeGreaterThan(pointerCommit);
    expect(reconcile).toBeGreaterThan(inPlaceCheckout);
    expect(dependentCommit).toBeGreaterThan(reconcile);
    expect(packaged).toMatch(/Spawn[\s\S]*fresh worktree reported by `arc resume`[\s\S]*arc wu reconcile/u);
    expect(packaged).toContain("`clean` — continue without a write, stage, or commit.");
    expect(packaged).toMatch(/`conflict`[\s\S]*base-side\s+pointer removal is already committed/u);
  });
});
