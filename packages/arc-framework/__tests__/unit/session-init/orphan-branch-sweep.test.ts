import { describe, it, expect, vi } from "vitest";

import { assertSchemaRefuses } from "../../helpers/schema-assertion.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import {
  analyzeOrphanBranchesSnapshot,
  OrphanBranchReportSchema,
  OrphanBranchSweepResultSchema,
  runOrphanBranchSweep,
} from "../../../src/lib/session-init/orphan-branch-sweep.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import type { ObjectAvailabilityResult } from "../../../src/lib/git/object-availability.js";
import type { RemoteHeadSnapshotResult } from "../../../src/lib/git/remote-ref-reader.js";

const NUL = "\u0000";

/** Per-branch fixture: its `upstream:track` token, landed-in-base verdict, and checkout path. */
interface BranchFixture {
  track: string;
  merged: boolean;
  worktreePath?: string;
}

/**
 * git stub driving the sweep end-to-end: `for-each-ref` lists every fixture
 * branch with its track token and checkout path; `cherry origin/<base> <branch>`
 * reflects each branch's landed-in-base verdict (`+`-prefixed line ⇒ unmerged);
 * `ls-tree` serves the `completed/` archive paths backing the shipped-WU index.
 */
function buildExec(
  branches: Record<string, BranchFixture>,
  shippedWorkUnits: string[] = [],
): GitExec {
  const surviving = scriptGitExec([
    {
      match: { prefix: ["for-each-ref"] },
      responses: [() => ({
        stdout: Object.entries(branches)
          .map(
            ([name, fixture]) => `${name}${NUL}${fixture.track}${NUL}${fixture.worktreePath ?? ""}`,
          )
          .join("\n"),
        stderr: "",
      })],
    },
    {
      match: { prefix: ["cherry"] },
      responses: [({ args }) => {
        const branch = args[2];
        const fixture = branch !== undefined ? branches[branch] : undefined;
        return { stdout: fixture?.merged ? "" : "+ deadbeef\n", stderr: "" };
      }],
    },
    {
      match: { predicate: () => true },
      responses: [({ args }) => {
        throw new Error(`unexpected git invocation: ${args.join(" ")}`);
      }],
    },
  ]);
  return (async (_cmd: string, args: string[], options) => {
    if (args[0] === "ls-tree") {
      const stdout = shippedWorkUnits
        .map(
          (slug, idx) =>
            `.arc/completed/2026-q2/${String(idx + 1).padStart(2, "0")}_${slug}/meta-${slug}.md`,
        )
        .join("\n");
      return { stdout, stderr: "" };
    }
    return surviving.exec("git", args, options);
  }) as GitExec;
}

function runSweep(
  branches: Record<string, BranchFixture>,
  options: { shipped?: string[]; errandBranches?: string[] } = {},
) {
  return runOrphanBranchSweep({
    worktreeIdentity: { kind: "primary" },
    baseBranch: "main",
    errandBranches: new Set(options.errandBranches ?? []),
    derivedRoster: [],
    exec: buildExec(branches, options.shipped ?? []),
  });
}

describe("runOrphanBranchSweep", () => {
  it("offers a gone-upstream branch that is merged to base, across any type prefix", async () => {
    const result = await runSweep({
      "plan/shipped": { track: "gone", merged: true },
      "feat/landed": { track: "gone", merged: true },
    });

    expect(result.orphans).toEqual([
      { branch: "plan/shipped", merged: true, shippedWorkUnit: null },
      { branch: "feat/landed", merged: true, shippedWorkUnit: null },
    ]);
  });

  it("surfaces a gone-upstream branch that is not merged, but does not offer it", async () => {
    const result = await runSweep({ "fix/unshipped": { track: "gone", merged: false } });

    expect(result.orphans).toEqual([
      { branch: "fix/unshipped", merged: false, shippedWorkUnit: null },
    ]);
  });

  it("names the shipped work unit when the branch slug matches a completed/ record", async () => {
    const result = await runSweep(
      {
        "feat/user-sync": { track: "gone", merged: false },
        "fix/loose-end": { track: "gone", merged: true },
      },
      { shipped: ["user-sync"] },
    );

    expect(result.orphans).toEqual([
      { branch: "feat/user-sync", merged: false, shippedWorkUnit: "user-sync" },
      { branch: "fix/loose-end", merged: true, shippedWorkUnit: null },
    ]);
  });

  it("ignores a malformed shipped slug without rejecting the orphan sweep", async () => {
    const result = await runSweep(
      { "feat/Not A Slug": { track: "gone", merged: true } },
      { shipped: ["Not A Slug"] },
    );

    expect(result.orphans).toEqual([
      { branch: "feat/Not A Slug", merged: true, shippedWorkUnit: null },
    ]);
  });

  it("does not sweep a branch whose upstream is still live", async () => {
    const result = await runSweep({ "feat/active": { track: "ahead 1", merged: true } });

    expect(result.orphans).toEqual([]);
  });

  it("does not sweep a bare (unprefixed) branch", async () => {
    const result = await runSweep({ trunk: { track: "gone", merged: true } });

    expect(result.orphans).toEqual([]);
  });

  it("does not sweep a delivery presentation ref", async () => {
    const result = await runSweep({ "delivery/example/first-member": { track: "gone", merged: true } });

    expect(result.orphans).toEqual([]);
  });

  it("does not sweep a branch carrying an errand record — the errand surfaces own it", async () => {
    const result = await runSweep(
      { "chore/errand-in-flight": { track: "gone", merged: true } },
      { errandBranches: ["chore/errand-in-flight"] },
    );

    expect(result.orphans).toEqual([]);
  });

  it("does not sweep a branch checked out in a worktree", async () => {
    const result = await runSweep({
      "feat/occupied": { track: "gone", merged: true, worktreePath: "/wt/occupied" },
    });

    expect(result.orphans).toEqual([]);
  });

  it("declines to run when errand records are unreadable (null exclusion set)", async () => {
    const exec: GitExec = vi.fn(async () => {
      throw new Error("git should not be invoked when the errand-record index is unavailable");
    });

    const result = await runOrphanBranchSweep({
      worktreeIdentity: { kind: "primary" },
      baseBranch: "main",
      errandBranches: null,
      derivedRoster: [],
      exec,
    });

    expect(result.orphans).toEqual([]);
    expect(exec).not.toHaveBeenCalled();
  });

  it("runs the network-free orphan scan from a linked worktree", async () => {
    const exec = vi.fn(buildExec({}));

    const result = await runOrphanBranchSweep({
      worktreeIdentity: { kind: "linked", path: "/wt/feature" },
      baseBranch: "main",
      errandBranches: new Set(),
      derivedRoster: [],
      exec,
    });

    expect(result.orphans).toEqual([]);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("skips the shipped-index read when no orphan survives the scan", async () => {
    const exec = vi.fn(buildExec({ "feat/active": { track: "ahead 1", merged: true } }));

    const result = await runOrphanBranchSweep({
      worktreeIdentity: { kind: "primary" },
      baseBranch: "main",
      errandBranches: new Set(),
      derivedRoster: [],
      exec: exec as GitExec,
    });

    expect(result.orphans).toEqual([]);
    const invokedSubcommands = exec.mock.calls.map((call) => (call[1] as string[])[0]);
    expect(invokedSubcommands).toEqual(["for-each-ref"]);
  });

  it("classifies surviving orphans against the supplied advertised base OID", async () => {
    const baseOid = "3".repeat(40);
    const surviving = scriptGitExec([
      { match: { prefix: ["for-each-ref"] }, responses: [{ stdout: `feat/shipped${NUL}gone${NUL}`, stderr: "" }] },
      { match: { prefix: ["cherry", baseOid] }, responses: [{ stdout: "", stderr: "" }] },
    ]);
    const exec: GitExec = async (_command, args, options) => {
      if (args[0] === "for-each-ref") {
        return surviving.exec(_command, args, options);
      }
      if (options?.objectAccess !== "local-only") throw new Error("object access was not local-only");
      if (args[0] === "ls-tree" && args[4] === baseOid) {
        return { stdout: ".arc/completed/2026-q2/01_shipped/meta-shipped.md", stderr: "" };
      }
      if (args[0] === "cherry" && args[1] === baseOid) return surviving.exec(_command, args, options);
      throw new Error(`tracking-ref fallback: ${args.join(" ")}`);
    };

    const result = await runOrphanBranchSweep({
      worktreeIdentity: { kind: "primary" },
      baseBranch: "main",
      errandBranches: new Set(),
      derivedRoster: [],
      exec,
      baseEvidence: {
        remoteSyncEnabled: true,
        snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
        objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
        history: { kind: "complete" },
      },
    });

    expect(result.orphans).toEqual([
      { branch: "feat/shipped", merged: true, shippedWorkUnit: "shipped" },
    ]);
  });

  it("partitions a mixed set — only reapable gone branches swept, verdicts attached", async () => {
    const result = await runSweep(
      {
        "plan/groomed": { track: "gone", merged: true },
        "feat/shipped-elsewhere": { track: "gone", merged: false },
        "fix/unmerged": { track: "gone", merged: false },
        "feat/active": { track: "ahead 1", merged: true },
        "chore/errand": { track: "gone", merged: true },
      },
      { shipped: ["shipped-elsewhere"], errandBranches: ["chore/errand"] },
    );

    expect(result.orphans).toEqual([
      { branch: "plan/groomed", merged: true, shippedWorkUnit: null },
      { branch: "feat/shipped-elsewhere", merged: false, shippedWorkUnit: "shipped-elsewhere" },
      { branch: "fix/unmerged", merged: false, shippedWorkUnit: null },
    ]);
  });
});

describe("analyzeOrphanBranchesSnapshot", () => {
  it("classifies removable and retained orphans against the exact advertised base", async () => {
    const baseOid = "1111111111111111111111111111111111111111";
    const surviving = scriptGitExec([{
      match: { prefix: ["cherry", baseOid] },
      responses: [({ args }) => ({
        stdout: args[2] === "feat/shipped" ? "" : "+ aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n",
        stderr: "",
      })],
    }]);
    const exec: GitExec = async (_cmd, args, options) => {
      if (options?.objectAccess !== "local-only") throw new Error("object access was not local-only");
      if (args[0] === "ls-tree") {
        if (args[4] !== baseOid) throw new Error("unexpected completed-index operand");
        return {
          stdout: ".arc/completed/2026-q2/01_shipped/meta-shipped.md",
          stderr: "",
        };
      }
      if (args[0] === "cherry") {
        if (args[1] !== baseOid) throw new Error("unexpected base operand");
        return surviving.exec(_cmd, args, options);
      }
      throw new Error(`unexpected git invocation: ${args.join(" ")}`);
    };

    const result = await analyzeOrphanBranchesSnapshot({
      exec,
      branches: ["feat/shipped", "fix/retained"],
      baseBranch: "main",
      remoteSyncEnabled: true,
      snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
      objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
      history: { kind: "complete" },
    });

    expect(result.orphans).toEqual([
      { branch: "feat/shipped", merged: true, shippedWorkUnit: "shipped" },
      { branch: "fix/retained", merged: false, shippedWorkUnit: null },
    ]);
  });

  it.each([
    {
      name: "pending-fetch",
      remoteSyncEnabled: true,
      snapshot: {
        kind: "available",
        scope: "all-heads",
        tips: { main: "1111111111111111111111111111111111111111" },
      } as RemoteHeadSnapshotResult,
      objectAvailability: {
        kind: "complete",
        commits: { "1111111111111111111111111111111111111111": false },
      } as ObjectAvailabilityResult,
    },
    {
      name: "unreachable",
      remoteSyncEnabled: true,
      snapshot: { kind: "unreachable", failureReason: "network" } as RemoteHeadSnapshotResult,
      objectAvailability: { kind: "complete", commits: {} } as ObjectAvailabilityResult,
    },
    {
      name: "remote-base-absent",
      remoteSyncEnabled: true,
      snapshot: { kind: "available", scope: "all-heads", tips: {} } as RemoteHeadSnapshotResult,
      objectAvailability: { kind: "complete", commits: {} } as ObjectAvailabilityResult,
    },
    {
      name: "not-applicable",
      remoteSyncEnabled: false,
      snapshot: {
        kind: "available",
        scope: "all-heads",
        tips: { main: "1111111111111111111111111111111111111111" },
      } as RemoteHeadSnapshotResult,
      objectAvailability: {
        kind: "complete",
        commits: { "1111111111111111111111111111111111111111": true },
      } as ObjectAvailabilityResult,
    },
  ])("does not authorize orphan cleanup for $name evidence", async ({
    remoteSyncEnabled,
    snapshot,
    objectAvailability,
  }: {
    remoteSyncEnabled: boolean;
    snapshot: RemoteHeadSnapshotResult;
    objectAvailability: ObjectAvailabilityResult;
  }) => {
    const result = await analyzeOrphanBranchesSnapshot({
      exec: buildExec({}, []),
      branches: ["feat/orphan"],
      baseBranch: "main",
      remoteSyncEnabled,
      snapshot,
      objectAvailability,
      history: { kind: "complete" },
    });

    expect(result.orphans).toEqual([{
      branch: "feat/orphan",
      merged: null,
      shippedWorkUnit: null,
      blockingReason: "evidence-unavailable",
    }]);
  });

  it("propagates an unreadable completed index", async () => {
    const baseOid = "1".repeat(40);
    await expect(analyzeOrphanBranchesSnapshot({
      exec: async () => { throw new Error("completed index failed"); },
      branches: ["feat/orphan"], baseBranch: "main", remoteSyncEnabled: true,
      snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
      objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
      history: { kind: "complete" },
    })).rejects.toThrow("completed index failed");
  });

  it("propagates malformed local graph output", async () => {
    const baseOid = "1".repeat(40);
    const surviving = scriptGitExec([{
      match: { prefix: ["cherry"] }, responses: [{ stdout: "+ malformed\n", stderr: "" }],
    }]);
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "ls-tree") return { stdout: "", stderr: "" };
      if (args[0] === "cherry") return surviving.exec(_command, args);
      throw new Error(`unexpected git invocation: ${args.join(" ")}`);
    };

    await expect(analyzeOrphanBranchesSnapshot({
      exec, branches: ["feat/orphan"], baseBranch: "main", remoteSyncEnabled: true,
      snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
      objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
      history: { kind: "complete" },
    })).rejects.toThrow("Malformed git cherry output");
  });

  it("retains an evidence-unavailable orphan when shallow history prevents merge analysis", async () => {
    const baseOid = "1".repeat(40);
    await expect(analyzeOrphanBranchesSnapshot({
      exec: buildExec({}, []), branches: ["feat/orphan"], baseBranch: "main", remoteSyncEnabled: true,
      snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
      objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
      history: { kind: "shallow" },
    })).resolves.toMatchObject({
      remoteEvidence: "exact",
      orphans: [{ branch: "feat/orphan", merged: null, blockingReason: "evidence-unavailable" }],
    });
  });
});

describe("OrphanBranchSweepResultSchema", () => {
  it("accepts an evidence-unavailable orphan without cleanup authority", () => {
    const value = {
      remoteEvidence: "pending-fetch",
      orphans: [{
        branch: "feat/pending",
        merged: null,
        shippedWorkUnit: null,
        blockingReason: "evidence-unavailable",
      }],
    } as const;

    expect(OrphanBranchSweepResultSchema.parse(value)).toEqual(value);
  });

  it.each([
    { branch: "feat/shipped", merged: false, shippedWorkUnit: "shipped" },
    { branch: "fix/unshipped", merged: true, shippedWorkUnit: null },
  ])("accepts shipped and unshipped orphan authority", (orphan) => {
    expect(OrphanBranchSweepResultSchema.parse({ remoteEvidence: "exact", orphans: [orphan] }))
      .toEqual({ remoteEvidence: "exact", orphans: [orphan] });
  });

  it.each([
    { branch: "", merged: true, shippedWorkUnit: null },
    { branch: "feat/work", merged: "yes", shippedWorkUnit: null },
    { branch: "feat/work", merged: true, shippedWorkUnit: "Not A Slug" },
    { branch: "feat/work", merged: true, shippedWorkUnit: null, leaked: true },
  ])("rejects a malformed orphan row", (orphan) => {
    assertSchemaRefuses(OrphanBranchReportSchema, orphan);
  });
});
