/**
 * Unit tests for active-WU cohort-doc resolution — the session-init signal that
 * locates the coordinating `cohort-<leaf>.md` for the active meta's `Cohort`
 * value. Covers leaf derivation (nested + single-segment), the no-cohort case,
 * and clean degradation when the backing doc (or the meta) is absent.
 */

import { describe, it, expect } from "vitest";

import {
  resolveActiveCohortDocPath,
  type CohortDocFs,
} from "../../../src/lib/session-init/cohort-doc.js";

const CWD = "/repo";

/** A meta file body carrying the given `Cohort` value (omitted when undefined). */
function meta(cohort?: string): string {
  const cohortLine = cohort === undefined ? "" : `\n- **Cohort:** \`${cohort}\`\n`;
  return [
    "# Metadata: foo",
    "",
    "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
    "|---|---|---|---|---|",
    "| `Active` | `andrew` | `feat/foo` | `Light` | `P2` |",
    cohortLine,
    "---",
    "",
  ].join("\n");
}

/** Stub fs: `metaContent` answers the meta read; `existing` is the set of present paths. */
function makeFs(metaContent: string | null, existing: Set<string>): CohortDocFs {
  return {
    readFile: async (p: string) => {
      if (metaContent !== null && p === `${CWD}/.arc/active/meta-foo.md`) return metaContent;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
    pathExists: async (p: string) => existing.has(p),
  };
}

const ACTIVE_META = ".arc/active/meta-foo.md";

describe("resolveActiveCohortDocPath", () => {
  it("resolves the `cohort-<leaf>.md` path for a nested Cohort value", async () => {
    const field = "agile-parallelism/concurrent-work-conventions";
    const docPath = ".arc/backlog/planned/agile-parallelism/concurrent-work-conventions/"
      + "cohort-concurrent-work-conventions.md";
    const fs = makeFs(meta(field), new Set([`${CWD}/${docPath}`]));

    const resolved = await resolveActiveCohortDocPath({ cwd: CWD, activeMetaPath: ACTIVE_META, fs });
    expect(resolved).toBe(docPath);
  });

  it("uses the cohort itself as the leaf for a single-segment Cohort value", async () => {
    const docPath = ".arc/backlog/planned/principle-anchored-core/cohort-principle-anchored-core.md";
    const fs = makeFs(meta("principle-anchored-core"), new Set([`${CWD}/${docPath}`]));

    const resolved = await resolveActiveCohortDocPath({ cwd: CWD, activeMetaPath: ACTIVE_META, fs });
    expect(resolved).toBe(docPath);
  });

  it("emits no path when the meta carries no Cohort value", async () => {
    const fs = makeFs(meta(undefined), new Set());
    expect(
      await resolveActiveCohortDocPath({ cwd: CWD, activeMetaPath: ACTIVE_META, fs }),
    ).toBeNull();
  });

  it("emits no path for the `[none]` standalone sentinel", async () => {
    const fs = makeFs(meta("[none]"), new Set());
    expect(
      await resolveActiveCohortDocPath({ cwd: CWD, activeMetaPath: ACTIVE_META, fs }),
    ).toBeNull();
  });

  it("degrades cleanly (no path, no throw) when no backing cohort doc is found", async () => {
    // Cohort set, but the resolved path is absent from the filesystem.
    const fs = makeFs(meta("agile-parallelism/concurrent-work-conventions"), new Set());
    expect(
      await resolveActiveCohortDocPath({ cwd: CWD, activeMetaPath: ACTIVE_META, fs }),
    ).toBeNull();
  });

  it("degrades cleanly when the active meta cannot be read", async () => {
    const fs = makeFs(null, new Set());
    expect(
      await resolveActiveCohortDocPath({ cwd: CWD, activeMetaPath: ACTIVE_META, fs }),
    ).toBeNull();
  });
});
