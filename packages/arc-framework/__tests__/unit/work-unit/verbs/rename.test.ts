import { describe, expect, it } from "vitest";

import { validateManagedPath } from "../../../../src/lib/kernel/canonical/managed-path.js";
import type { RenameRetirementContext } from "../../../../src/lib/work-unit/direct-retirement-driver.js";
import type { TransitionRecord } from "../../../../src/lib/work-unit/transition-record.js";
import {
  runRename,
  type RenamePlan,
  type RunRenameContext,
} from "../../../../src/lib/work-unit/verbs/rename.js";

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
    coordinationAdvisories: [],
  };
}

function buildContext(options: {
  shape?: RenamePlan["shape"];
  resuming?: boolean;
  failAt?: string;
} = {}): {
  ctx: RunRenameContext;
  calls: string[];
  recordedTransitions: TransitionRecord[];
} {
  const calls: string[] = [];
  const recordedTransitions: TransitionRecord[] = [];
  const selected = plan(options.shape ?? "spawned", options.resuming ?? false);
  const source = {
    scope: {
      subject: { kind: "work-unit" as const, name: "old-name" },
      transition: "rename" as const,
      source: { branch: selected.shape === "stub" ? "chore/rename-old-name-to-new-name" : "feat/old-name", head: "a".repeat(40) },
      resultProjection: { ref: selected.shape === "stub" ? "chore/rename-old-name-to-new-name" : "feat/old-name", head: "a".repeat(40) },
    },
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
          },
        };
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
    completeTransition: async () => {
      calls.push("complete");
      if (options.failAt === "completion") {
        return { status: "refused", reason: "authority-conflict" } as const;
      }
      return { status: "completed-no-record", authorityVersion: "v2" } as const;
    },
    readTransitionPatch: async () => {
      calls.push("patch");
      return [];
    },
  } satisfies RenameRetirementContext;
  const ctx: RunRenameContext = {
    retirement,
    transitionWriter: {
      record: async (record) => {
        calls.push("transition-record");
        if (options.failAt === "transition-origin-occupied") return { status: "origin-occupied" };
        if (options.failAt === "transition-unavailable") {
          return { status: "unavailable", diagnostic: "transition store unavailable" };
        }
        recordedTransitions.push(record);
        return { status: "recorded" };
      },
      rollback: async (record) => {
        calls.push("transition-rollback");
        const index = recordedTransitions.indexOf(record);
        if (index >= 0) recordedTransitions.splice(index, 1);
        return { status: "rolled-back" };
      },
    },
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
    rekeyLocus: async (_plan, move) => {
      calls.push("rekey-locus");
      fail("rekey-locus");
      return {
        locus: { kind: "rekeyed", recordId: `sha256:${"d".repeat(64)}` },
        ...(move.status === "move"
          ? {
              worktree: {
                mutation: "move" as const,
                from: move.from,
                to: move.to,
                locusHopped: true,
              },
            }
          : {}),
      };
    },
    reconcileWorktreeMoveMarker: async () => {
      calls.push("marker-move");
      return "renamed";
    },
  };
  return { ctx, calls, recordedTransitions };
}

describe("runRename", () => {
  it("surfaces prepared coordination advisories before tracked mutation", async () => {
    const { ctx, calls } = buildContext();
    const preflight = ctx.preflight;
    ctx.preflight = async (request) => ({
      ...await preflight(request),
      coordinationAdvisories: ["coordinate integrating dependent"],
    });
    ctx.onPrepared = async (prepared) => {
      calls.push(`surface:${prepared.coordinationAdvisories.join(",")}`);
    };

    await runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" });

    expect(calls.slice(0, 3)).toEqual([
      "preflight",
      "surface:coordinate integrating dependent",
      "capture",
    ]);
  });

  it("records lean rename history without a retirement receipt", async () => {
    const { ctx, recordedTransitions } = buildContext();

    await runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" });

    expect(recordedTransitions).toEqual([{
      schemaVersion: 1,
      origin: "old-name",
      kind: "rename",
      successors: ["new-name"],
      edges: [],
    }]);
  });

  it("commits the tracked sweep before all five spawned identity legs", async () => {
    const { ctx, calls } = buildContext();

    await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
      .resolves.toMatchObject({ status: "renamed", shape: "spawned", trackedCommit: "created" });
    expect(calls).toEqual([
      "preflight", "capture", "snapshot", "mutate", "stage", "roadmap", "transition-record", "complete", "commit",
      "branch", "notes", "remote", "marker", "resolve-worktree", "rekey-locus",
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
    expect(calls).toEqual(["preflight", "branch", "notes", "remote", "marker", "resolve-worktree", "rekey-locus"]);
  });

  it("rolls back the patch and lean history when the commit is refused", async () => {
    const { ctx, calls, recordedTransitions } = buildContext({ failAt: "commit" });

    await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
      .resolves.toMatchObject({ status: "rejected", reason: expect.stringMatching(/commit refused/iu) });
    expect(calls).toContain("rollback-refused");
    expect(calls).toContain("transition-rollback");
    expect(recordedTransitions).toEqual([]);
    expect(calls).not.toContain("branch");
  });

  it("rolls back lean history when record-neutral completion refuses", async () => {
    const { ctx, calls, recordedTransitions } = buildContext({ failAt: "completion" });

    await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
      .resolves.toMatchObject({ status: "rejected", reason: expect.stringMatching(/completion refused/iu) });
    expect(calls).toContain("rollback-refused");
    expect(calls).toContain("transition-rollback");
    expect(recordedTransitions).toEqual([]);
    expect(calls).not.toContain("commit");
  });

  it("maps an occupied transition origin to a stable refusal and rolls back the tracked attempt", async () => {
    const { ctx, calls } = buildContext({ failAt: "transition-origin-occupied" });

    await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" })).resolves.toEqual({
      status: "rejected",
      reason: "rename transition recording refused: origin-occupied",
    });
    expect(calls).toContain("rollback-refused");
    expect(calls).not.toContain("commit");
  });

  it("returns a resumable partial outcome at an identity-leg boundary", async () => {
    const { ctx, calls } = buildContext({ failAt: "notes" });

    await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
      .resolves.toEqual({ status: "partial", reason: "notes failed" });
    expect(calls.at(-1)).toBe("notes");
  });

  it("records a self-move defer without relocating the checkout", async () => {
    const { ctx, calls } = buildContext();
    ctx.resolveWorktreeMove = async () => {
      calls.push("resolve-worktree");
      return {
        status: "deferred-self-move",
        from: "/work/project.old-name",
        to: "/work/project.new-name",
      };
    };

    await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
      .resolves.toMatchObject({
        status: "renamed",
        marker: "renamed",
        worktree: { status: "deferred-self-move" },
      });
    expect(calls).toContain("marker-move");
  });

  it.each(["branch", "notes", "remote", "marker", "rekey-locus"] as const)(
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
      ctx.rekeyLocus = async () => {
        apply("rekey-locus");
        return {
          locus: { kind: "rekeyed", recordId: `sha256:${"d".repeat(64)}` },
          worktree: {
            mutation: "move",
            from: "/work/project.old-name",
            to: "/work/project.new-name",
            locusHopped: true,
          },
        };
      };

      await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
        .resolves.toMatchObject({ status: "partial" });
      mutations.length = 0;
      injectFailure = false;

      await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
        .resolves.toMatchObject({ status: "renamed", trackedCommit: "existing" });
      const order = ["branch", "notes", "remote", "marker", "rekey-locus"];
      expect(mutations).toEqual(order.slice(order.indexOf(failureLeg)));
    },
  );
});

describe("runRename locus rekey", () => {
  it("rekeys an in-place subject without resolving or performing a worktree move", async () => {
    const { ctx, calls } = buildContext({ shape: "in-place" });
    let requested: string | null = null;
    ctx.rekeyLocus = async (_plan, move) => {
      requested = move.status;
      return { locus: { kind: "rekeyed", recordId: `sha256:${"d".repeat(64)}` } };
    };

    await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
      .resolves.toMatchObject({ status: "renamed", shape: "in-place" });
    expect(requested).toBe("in-place");
    expect(calls).not.toContain("resolve-worktree");
  });

  it("hands the resolved move to the rekey rather than moving the worktree beside it", async () => {
    const { ctx } = buildContext();
    let handed: unknown = null;
    ctx.rekeyLocus = async (_plan, move) => {
      handed = move;
      return {
        locus: { kind: "rekeyed", recordId: `sha256:${"d".repeat(64)}` },
        worktree: { mutation: "move", from: "/work/project.old-name", to: "/work/project.new-name", locusHopped: true },
      };
    };

    const result = await runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" });

    expect(handed).toEqual({ status: "move", from: "/work/project.old-name", to: "/work/project.new-name" });
    expect(result).toMatchObject({
      status: "renamed",
      worktree: { mutation: "move", locusHopped: true },
      locus: { kind: "rekeyed" },
    });
  });

  it("surfaces a refused rekey as a resumable partial", async () => {
    const { ctx } = buildContext();
    ctx.rekeyLocus = async () => ({ locus: { kind: "refused", reason: "lease-live" } });

    await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
      .resolves.toEqual({ status: "partial", reason: "session locus rekey refused: lease-live" });
  });

  it("reconciles the ownership marker when the worktree move already landed", async () => {
    const { ctx, calls } = buildContext();
    ctx.resolveWorktreeMove = async () => ({
      status: "already-moved",
      worktreePath: "/work/project.new-name",
      sourceWorktreePath: "/work/project.old-name",
    });

    await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
      .resolves.toMatchObject({ status: "renamed", marker: "renamed" });
    expect(calls).toContain("marker-move");
  });

  it("completes a rename when the checkout has no locus record", async () => {
    const { ctx } = buildContext();
    ctx.rekeyLocus = async () => ({ locus: { kind: "absent" } });

    await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
      .resolves.toMatchObject({ status: "renamed", locus: { kind: "absent" } });
  });

  it("requests no rekey for a stub subject", async () => {
    const { ctx } = buildContext({ shape: "stub" });
    ctx.rekeyLocus = async () => {
      throw new Error("stub rename must not rekey a locus record");
    };

    await expect(runRename(ctx, { sourceSlug: "old-name", targetSlug: "new-name" }))
      .resolves.toMatchObject({ status: "renamed", shape: "stub", pendingIntegration: true });
  });
});
