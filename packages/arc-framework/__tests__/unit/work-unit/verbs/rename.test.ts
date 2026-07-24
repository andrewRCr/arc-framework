import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../src/lib/canonical/canonical-json.js";
import { validateManagedPath } from "../../../../src/lib/kernel/canonical/managed-path.js";
import type { RenameRetirementContext } from "../../../../src/lib/work-unit/direct-retirement-driver.js";
import {
  runRename,
  type RenamePlan,
  type RunRenameContext,
} from "../../../../src/lib/work-unit/verbs/rename.js";

const DIGEST = canonicalDigest({ fixture: "rename" });

function plan(shape: RenamePlan["shape"], resuming = false): RenamePlan {
  return {
    shape,
    sourceSlug: "old-name",
    targetSlug: "new-name",
    resolvedSlug: resuming ? "new-name" : "old-name",
    resuming,
    sourceDir: ".arc/active",
    resultDir: ".arc/active",
    expectedBranch: shape === "stub" ? null : "feat/old-name",
    oldBranch: shape === "stub" ? null : "feat/old-name",
    newBranch: shape === "stub" ? null : "feat/new-name",
    oldRemoteOid: shape === "stub" ? null : "c".repeat(40),
    additionalPaths: [".arc/active/meta-sibling.md"],
    worktreePath: shape === "spawned" ? "/work/project.old-name" : null,
    baseBranch: "main",
  };
}

function buildContext(options: {
  shape?: RenamePlan["shape"];
  resuming?: boolean;
  failAt?: string;
} = {}): { ctx: RunRenameContext; calls: string[] } {
  const calls: string[] = [];
  const selected = plan(options.shape ?? "spawned", options.resuming ?? false);
  const source = {
    scope: {
      subject: { kind: "work-unit" as const, name: "old-name" },
      transition: "rename" as const,
      source: { branch: selected.shape === "stub" ? "chore/rename-old-name-to-new-name" : "feat/old-name", head: "a".repeat(40) },
      resultProjection: { ref: selected.shape === "stub" ? "chore/rename-old-name-to-new-name" : "feat/old-name", head: "a".repeat(40) },
    },
    artifactDigest: DIGEST,
    sourceArtifactPaths: [validateManagedPath(".arc/active/meta-old-name.md")],
    resultArtifactPaths: [validateManagedPath(".arc/active/meta-new-name.md")],
    slugMap: { sourceSlug: "old-name", targetSlug: "new-name" },
  };
  const fail = (name: string): void => {
    if (options.failAt === name) throw new Error(`${name} failed`);
  };
  const retirement = {
    authority: {
      readSnapshot: async () => {
        calls.push("snapshot");
        return {
          status: "resolved" as const,
          snapshot: {
            authorityVersion: "v1",
            sourceRefOid: "b".repeat(40),
            resultRefOid: "b".repeat(40),
            recordState: "absent" as const,
          },
        };
      },
      record: async () => {
        calls.push("record");
        return { status: "recorded" as const, authorityVersion: "v2" };
      },
    },
    captureSource: async () => {
      calls.push("capture");
      return source;
    },
    stageTransition: async () => {
      calls.push("stage");
    },
    rollbackTransition: async () => {
      calls.push("rollback-transition");
    },
    rollbackRefusedCommit: async () => {
      calls.push("rollback-refused");
      return { status: "rolled-back" as const };
    },
    readTransitionPatch: async () => {
      calls.push("patch");
      return [];
    },
    readResultArtifactDigest: async () => {
      calls.push("artifact-digest");
      return DIGEST;
    },
  } satisfies RenameRetirementContext;
  const ctx: RunRenameContext = {
    retirement,
    preflight: async () => {
      calls.push("preflight");
      return selected;
    },
    mutateTracked: async () => {
      calls.push("mutate");
      fail("mutate");
    },
    regenerateReadiness: async () => {
      calls.push("roadmap");
      return options.failAt === "roadmap-advisory" ? "ROADMAP regen failed" : undefined;
    },
    commitTracked: async () => {
      calls.push("commit");
      fail("commit");
    },
    withStubBranch: async (_plan, operation) => {
      calls.push("stub-branch-enter");
      try {
        return await operation();
      } finally {
        calls.push("stub-branch-rest");
      }
    },
    renameLocalBranch: async () => {
      calls.push("branch");
      fail("branch");
    },
    renameUserWorkspace: async () => {
      calls.push("notes");
      fail("notes");
    },
    renameRemoteBranch: async () => {
      calls.push("remote");
      fail("remote");
      return { status: "renamed", oldOid: "c".repeat(40) };
    },
    renameMarker: async () => {
      calls.push("marker");
      fail("marker");
      return "renamed";
    },
    resolveWorktreeMove: async () => {
      calls.push("resolve-worktree");
      return { status: "move", from: "/work/project.old-name", to: "/work/project.new-name" };
    },
    moveWorktree: async () => {
      calls.push("move-worktree");
      fail("move-worktree");
      return {
        mutation: "move",
        from: "/work/project.old-name",
        to: "/work/project.new-name",
        locusHopped: true,
      };
    },
  };
  return { ctx, calls };
}

describe("runRename", () => {
  it("commits the tracked sweep before all five spawned identity legs", async () => {
    const { ctx, calls } = buildContext();

    await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
      .resolves.toMatchObject({ status: "renamed", shape: "spawned", trackedCommit: "created" });
    expect(calls).toEqual([
      "preflight", "capture", "snapshot", "mutate", "stage", "roadmap", "patch", "artifact-digest", "record", "commit",
      "branch", "notes", "remote", "marker", "resolve-worktree", "move-worktree",
    ]);
  });

  it("runs only branch, notes, and remote legs for an in-place subject", async () => {
    const { ctx, calls } = buildContext({ shape: "in-place" });

    await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
      .resolves.toMatchObject({ status: "renamed", shape: "in-place" });
    expect(calls).toContain("branch");
    expect(calls).toContain("notes");
    expect(calls).toContain("remote");
    expect(calls).not.toContain("marker");
    expect(calls).not.toContain("resolve-worktree");
  });

  it("retains a ROADMAP failure advisory without rolling back the tracked rename", async () => {
    const { ctx, calls } = buildContext({ failAt: "roadmap-advisory" });

    await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
      .resolves.toMatchObject({
        status: "renamed",
        advisories: ["ROADMAP regen failed"],
      });
    expect(calls).not.toContain("rollback-transition");
  });

  it("runs the tracked phase on a stub branch and no identity legs", async () => {
    const { ctx, calls } = buildContext({ shape: "stub" });

    await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
      .resolves.toMatchObject({ status: "renamed", shape: "stub", pendingIntegration: true });
    expect(calls).toContain("stub-branch-enter");
    expect(calls).toContain("stub-branch-rest");
    expect(calls).not.toContain("branch");
    expect(calls).not.toContain("notes");
  });

  it("skips the tracked phase on a post-commit resume", async () => {
    const { ctx, calls } = buildContext({ resuming: true });

    await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
      .resolves.toMatchObject({ status: "renamed", trackedCommit: "existing" });
    expect(calls).toEqual(["preflight", "branch", "notes", "remote", "marker", "resolve-worktree", "move-worktree"]);
  });

  it("rolls back the patch and record when the commit is refused", async () => {
    const { ctx, calls } = buildContext({ failAt: "commit" });

    await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
      .resolves.toMatchObject({ status: "rejected", reason: expect.stringMatching(/commit refused/iu) });
    expect(calls).toContain("rollback-refused");
    expect(calls).not.toContain("branch");
  });

  it("returns a resumable partial outcome at an identity-leg boundary", async () => {
    const { ctx, calls } = buildContext({ failAt: "notes" });

    await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
      .resolves.toEqual({ status: "partial", reason: "notes failed" });
    expect(calls.at(-1)).toBe("notes");
  });

  it.each(["branch", "notes", "remote", "marker", "move-worktree"] as const)(
    "resumes from the outstanding %s identity leg",
    async (failureLeg) => {
      const { ctx } = buildContext();
      const landed = new Set<string>();
      const mutations: string[] = [];
      let trackedCommitted = false;
      let injectFailure = true;
      const apply = (leg: string): void => {
        if (landed.has(leg)) return;
        mutations.push(leg);
        if (leg === failureLeg && injectFailure) throw new Error(`${leg} interrupted`);
        landed.add(leg);
      };
      ctx.preflight = async () => plan("spawned", trackedCommitted);
      ctx.commitTracked = async () => {
        trackedCommitted = true;
      };
      ctx.renameLocalBranch = async () => {
        apply("branch");
      };
      ctx.renameUserWorkspace = async () => {
        apply("notes");
      };
      ctx.renameRemoteBranch = async () => {
        apply("remote");
        return { status: "renamed", oldOid: "c".repeat(40) };
      };
      ctx.renameMarker = async () => {
        apply("marker");
        return "renamed";
      };
      ctx.moveWorktree = async () => {
        apply("move-worktree");
        return {
          mutation: "move",
          from: "/work/project.old-name",
          to: "/work/project.new-name",
          locusHopped: true,
        };
      };

      await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
        .resolves.toMatchObject({ status: "partial" });
      mutations.length = 0;
      injectFailure = false;

      await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
        .resolves.toMatchObject({ status: "renamed", trackedCommit: "existing" });
      const order = ["branch", "notes", "remote", "marker", "move-worktree"];
      expect(mutations).toEqual(order.slice(order.indexOf(failureLeg)));
    },
  );
});
