import { describe, it, expect } from "vitest";

import {
  branchToWorkUnitSlug,
  isShippedWorkUnit,
  readShippedWorkUnits,
  type CompletedIndexFs,
} from "../../../src/lib/work-unit/completed-index.js";

/**
 * In-memory `readdir` adapter from an explicit dir-path → children map. A path
 * absent from the map throws ENOENT (mirrors node:fs on a missing dir); a path
 * that maps to a file in production would throw ENOTDIR, modeled here as a
 * plain throw so the scanner's skip-on-error path is exercised.
 */
function buildReaddirFs(dirs: Record<string, string[]>): CompletedIndexFs {
  return {
    readdir: async (path) => {
      const norm = path.replace(/\/$/u, "");
      const entry = dirs[norm];
      if (entry === undefined) {
        const err = new Error(`ENOENT: ${path}`) as Error & { code?: string };
        err.code = "ENOENT";
        throw err;
      }
      return entry;
    },
  };
}

const completed = "/repo/.arc/completed";

describe("readShippedWorkUnits", () => {
  it("collects NN_<slug> dirs across every quarter into a slug set", async () => {
    const fs = buildReaddirFs({
      [completed]: ["2025-q4", "2026-q1", "2026-q2"],
      [`${completed}/2025-q4`]: ["01_chore-sync", "03_terminology-refactoring"],
      [`${completed}/2026-q1`]: ["07_cli-implementation"],
      [`${completed}/2026-q2`]: ["10_work-organization-reform"],
    });

    const shipped = await readShippedWorkUnits({ cwd: "/repo", fs });

    expect([...shipped].sort()).toEqual([
      "chore-sync",
      "cli-implementation",
      "terminology-refactoring",
      "work-organization-reform",
    ]);
  });

  it("ignores loose files that do not match the NN_<slug> archive shape", async () => {
    const fs = buildReaddirFs({
      [completed]: ["2026-q1"],
      [`${completed}/2026-q1`]: ["07_cli-implementation", "completed-atomic-2026-q1.md"],
    });

    const shipped = await readShippedWorkUnits({ cwd: "/repo", fs });

    expect(shipped.has("cli-implementation")).toBe(true);
    expect(shipped.has("completed-atomic-2026-q1.md")).toBe(false);
    expect(shipped.size).toBe(1);
  });

  it("returns an empty set when completed/ is absent", async () => {
    const shipped = await readShippedWorkUnits({ cwd: "/repo", fs: buildReaddirFs({}) });
    expect(shipped.size).toBe(0);
  });

  it("skips a non-directory quarter entry without throwing", async () => {
    const fs = buildReaddirFs({
      [completed]: ["2026-q1", "README.md"],
      [`${completed}/2026-q1`]: ["07_cli-implementation"],
      // No key for `${completed}/README.md` → readdir throws → skipped.
    });

    const shipped = await readShippedWorkUnits({ cwd: "/repo", fs });

    expect([...shipped]).toEqual(["cli-implementation"]);
  });
});

describe("branchToWorkUnitSlug", () => {
  it("strips the type-prefix from a branched WU name", () => {
    expect(branchToWorkUnitSlug("feat/worktree-foundation")).toBe("worktree-foundation");
    expect(branchToWorkUnitSlug("plan/worktree-foundation")).toBe("worktree-foundation");
  });

  it("returns null for a branch carrying no <type>/ prefix", () => {
    expect(branchToWorkUnitSlug("main")).toBeNull();
  });
});

describe("isShippedWorkUnit", () => {
  it("is true only when the branch's WU slug is in the shipped set", () => {
    const shipped = new Set(["work-organization-reform"]);
    expect(isShippedWorkUnit("feat/work-organization-reform", shipped)).toBe(true);
    expect(isShippedWorkUnit("feat/worktree-foundation", shipped)).toBe(false);
    expect(isShippedWorkUnit("main", shipped)).toBe(false);
  });
});
