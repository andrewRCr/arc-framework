import { describe, it, expect } from "vitest";

import {
  branchToWorkUnitSlug,
  computeArchiveDestination,
  isShippedWorkUnit,
  readShippedWorkUnits,
  readShippedWorkUnitRecordsFromRef,
  readShippedWorkUnitsFromRef,
  type CompletedIndexFs,
} from "../../../src/lib/work-unit/completed-index.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

/**
 * A {@link GitExec} that returns fixed stdout for an `ls-tree` read and throws
 * for any other invocation — the ref-tree reader's only git dependency.
 */
function buildLsTreeExec(stdout: string): GitExec {
  return async (_cmd, args) => {
    if (args[0] === "ls-tree") return { stdout };
    throw new Error(`unexpected git ${args.join(" ")}`);
  };
}

function buildTreeExec(input: {
  paths: string[];
  blobs: Record<string, string>;
}): GitExec {
  return async (_cmd, args) => {
    if (args[0] === "ls-tree") return { stdout: input.paths.join("\n") };
    if (args[0] === "show") {
      const spec = args[1];
      if (typeof spec !== "string") throw new Error("missing show spec");
      const path = spec.slice(spec.indexOf(":") + 1);
      const blob = input.blobs[path];
      if (blob !== undefined) return { stdout: blob };
    }
    throw new Error(`unexpected git ${args.join(" ")}`);
  };
}

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

  it("ignores cohort closeout entries", async () => {
    const fs = buildReaddirFs({
      [completed]: ["2026-q2"],
      [`${completed}/2026-q2`]: [
        "18_doc-cascade-sweep",
        "18a_cohort-agile-wu-lifecycle",
      ],
    });

    const shipped = await readShippedWorkUnits({ cwd: "/repo", fs });

    expect([...shipped]).toEqual(["doc-cascade-sweep"]);
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

describe("readShippedWorkUnitsFromRef", () => {
  it("collects NN_<slug> dirs from a ref's recursive completed/ tree", async () => {
    const exec = buildLsTreeExec(
      [
        ".arc/completed/2026-q2/03_decompose-matrix/SESSION-NOTES.md",
        ".arc/completed/2026-q2/03_decompose-matrix/spec-decompose-matrix.md",
        ".arc/completed/2026-q1/07_cli-implementation/meta-cli-implementation.md",
      ].join("\n"),
    );

    const shipped = await readShippedWorkUnitsFromRef(exec, "origin/main");

    expect([...shipped].sort()).toEqual(["cli-implementation", "decompose-matrix"]);
  });

  it("ignores cohort closeout entries", async () => {
    const exec = buildLsTreeExec(
      [
        ".arc/completed/2026-q2/18_doc-cascade-sweep/meta-doc-cascade-sweep.md",
        ".arc/completed/2026-q2/18a_cohort-agile-wu-lifecycle/cohort-agile-wu-lifecycle.md",
      ].join("\n"),
    );

    const shipped = await readShippedWorkUnitsFromRef(exec, "origin/main");

    expect([...shipped]).toEqual(["doc-cascade-sweep"]);
  });

  it("reads completion dates from shipped WU meta files", async () => {
    const metaPath = ".arc/completed/2026-q2/03_decompose-matrix/meta-decompose-matrix.md";
    const exec = buildTreeExec({
      paths: [
        metaPath,
        ".arc/completed/2026-q2/03_decompose-matrix/spec-decompose-matrix.md",
        ".arc/completed/2026-q2/04_missing-meta/spec-missing-meta.md",
        ".arc/completed/2026-q2/04a_cohort-demo/cohort-demo.md",
      ],
      blobs: {
        [metaPath]:
          "# Metadata: decompose-matrix\n\n"
          + "- **State:** Shipped\n"
          + "- **Completed:** 2026-06-20\n",
      },
    });

    const records = await readShippedWorkUnitRecordsFromRef(exec, "origin/main");

    expect(records.get("decompose-matrix")).toEqual({
      slug: "decompose-matrix",
      completedAt: "2026-06-20",
    });
    expect(records.get("missing-meta")).toEqual({
      slug: "missing-meta",
      completedAt: null,
    });
    expect(records.has("cohort-demo")).toBe(false);
  });

  it("bounds concurrent meta-file reads from a ref", async () => {
    const paths = Array.from({ length: 33 }, (_, idx) => {
      const seq = String(idx + 1).padStart(2, "0");
      return `.arc/completed/2026-q2/${seq}_wu-${seq}/meta-wu-${seq}.md`;
    });
    let activeShows = 0;
    let maxActiveShows = 0;
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "ls-tree") return { stdout: paths.join("\n"), stderr: "" };
      if (args[0] === "show") {
        activeShows += 1;
        maxActiveShows = Math.max(maxActiveShows, activeShows);
        await new Promise((resolve) => setTimeout(resolve, 1));
        activeShows -= 1;
        return { stdout: "- **Completed:** 2026-06-20\n", stderr: "" };
      }
      throw new Error(`unexpected git ${args.join(" ")}`);
    };

    const records = await readShippedWorkUnitRecordsFromRef(exec, "origin/main");

    expect(records.size).toBe(33);
    expect(maxActiveShows).toBeLessThanOrEqual(16);
  });

  it("returns an empty set when the ref does not resolve", async () => {
    const exec: GitExec = async () => {
      throw new Error("fatal: not a valid object name origin/main");
    };

    const shipped = await readShippedWorkUnitsFromRef(exec, "origin/main");

    expect(shipped.size).toBe(0);
  });
});

describe("computeArchiveDestination", () => {
  // June 2026 → 2026-q2 (month index 5 ÷ 3 = quarter 2).
  const clock = (): Date => new Date(2026, 5, 15, 12, 0, 0);

  it("derives the quarter from the injected clock and assigns the next NN after the quarter's max", async () => {
    const fs = buildReaddirFs({
      [`${completed}/2026-q2`]: ["01_alpha", "02_beta", "24_lifecycle-state-resolver"],
    });

    const dest = await computeArchiveDestination({ cwd: "/repo", fs, clock, name: "lifecycle-transition-core" });

    expect(dest.quarter).toBe("2026-q2");
    expect(dest.sequence).toBe("25");
    expect(dest.toDir).toBe(".arc/completed/2026-q2/25_lifecycle-transition-core");
  });

  it("assigns 01 when the quarter directory is absent (first archive of the quarter)", async () => {
    const dest = await computeArchiveDestination({ cwd: "/repo", fs: buildReaddirFs({}), clock, name: "foo" });

    expect(dest.quarter).toBe("2026-q2");
    expect(dest.sequence).toBe("01");
    expect(dest.toDir).toBe(".arc/completed/2026-q2/01_foo");
  });

  it("counts a cohort closeout sidecar's shared NN when finding the quarter's max", async () => {
    const fs = buildReaddirFs({
      [`${completed}/2026-q2`]: ["18_doc-cascade-sweep", "18a_cohort-agile-wu-lifecycle"],
    });

    const dest = await computeArchiveDestination({ cwd: "/repo", fs, clock, name: "foo" });

    expect(dest.sequence).toBe("19");
  });

  it("ignores entries that do not carry an NN archive prefix", async () => {
    const fs = buildReaddirFs({
      [`${completed}/2026-q2`]: ["03_gamma", "completed-atomic-2026-q2.md", "README.md"],
    });

    const dest = await computeArchiveDestination({ cwd: "/repo", fs, clock, name: "foo" });

    expect(dest.sequence).toBe("04");
  });

  it("derives each quarter from the clock's month (Q1 / Q3 / Q4 boundaries)", async () => {
    const at = (month: number): Promise<string> =>
      computeArchiveDestination({
        cwd: "/repo",
        fs: buildReaddirFs({}),
        clock: () => new Date(2026, month, 1, 12, 0, 0),
        name: "foo",
      }).then((d) => d.quarter);

    expect(await at(0)).toBe("2026-q1"); // January
    expect(await at(8)).toBe("2026-q3"); // September
    expect(await at(11)).toBe("2026-q4"); // December
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
