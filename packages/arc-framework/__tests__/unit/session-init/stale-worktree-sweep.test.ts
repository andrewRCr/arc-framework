import { describe, it, expect } from "vitest";

import { findStaleWorktreeCandidates } from "../../../src/lib/session-init/stale-worktree-sweep.js";
import type { WorktreeRosterResult } from "../../../src/lib/git/worktree-roster.js";

const shipped = new Set(["work-organization-reform"]);

/** Roster with one shipped-WU worktree and one still-active worktree. */
function roster(): WorktreeRosterResult {
  return {
    entries: [
      {
        worktreePath: "/wt/wor",
        branch: "feat/work-organization-reform",
        metaFilePath: "/wt/wor/.arc/active/meta-work-organization-reform.md",
      },
      {
        worktreePath: "/wt/foundation",
        branch: "feat/worktree-foundation",
        metaFilePath: "/wt/foundation/.arc/active/meta-worktree-foundation.md",
      },
    ],
    warnings: [],
  };
}

describe("findStaleWorktreeCandidates", () => {
  it("surfaces a lingering worktree whose WU has shipped", () => {
    const result = findStaleWorktreeCandidates({
      roster: roster(),
      shipped,
      worktreeIdentity: { kind: "primary" },
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.branch).toBe("feat/work-organization-reform");
  });

  it("does not surface a worktree whose WU is still active", () => {
    const result = findStaleWorktreeCandidates({
      roster: roster(),
      shipped,
      worktreeIdentity: { kind: "primary" },
    });

    const branches = result.candidates.map((c) => c.branch);
    expect(branches).not.toContain("feat/worktree-foundation");
  });

  it("scans no siblings outside the primary worktree (the resume path)", () => {
    const result = findStaleWorktreeCandidates({
      roster: roster(),
      shipped,
      worktreeIdentity: { kind: "linked", path: "/wt/foundation" },
    });

    expect(result.candidates).toEqual([]);
  });
});
