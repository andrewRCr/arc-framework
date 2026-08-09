import { describe, expect, it, vi } from "vitest";

import {
  projectRenameMoveRemedy,
  runLandedRetirementSweep,
} from "../../../src/lib/session-init/lifecycle-residue-sweep.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import type { ObjectAvailabilityResult } from "../../../src/lib/git/object-availability.js";
import type { RemoteHeadSnapshotResult } from "../../../src/lib/git/remote-ref-reader.js";
import type { RegisteredWorktree } from "../../../src/lib/git/worktree-roster.js";
import type { WorktreeMarkerReadResult } from "../../../src/lib/git/worktree-marker.js";

const HEAD = "0123456789abcdef0123456789abcdef01234567";

function registered(overrides: Partial<RegisteredWorktree> = {}): RegisteredWorktree {
  return {
    path: "/wt/project.old-name",
    head: HEAD,
    branch: "feat/new-name",
    detached: false,
    primary: false,
    ...overrides,
  };
}

function pendingMarker(
  overrides: { renameMovePending?: {
    oldSlug: string;
    newSlug: string;
    branch: string;
    head: string;
    from: string;
    to: string;
  } } = {},
): WorktreeMarkerReadResult {
  return {
    kind: "present",
    marker: {
      spawnedByArc: true,
      wuName: "new-name",
      createdFor: { kind: "work-unit", name: "new-name" },
      spawningIdentity: "andrew",
      createdAt: "2026-07-23T00:00:00.000Z",
      renameMovePending: {
        oldSlug: "old-name",
        newSlug: "new-name",
        branch: "feat/new-name",
        head: HEAD,
        from: "/wt/project.old-name",
        to: "/wt/project.new-name",
      },
      ...overrides,
    },
  };
}

function ownedMarker(name = "retired"): WorktreeMarkerReadResult {
  return {
    kind: "present",
    marker: {
      spawnedByArc: true,
      wuName: name,
      createdFor: { kind: "work-unit", name },
      spawningIdentity: "andrew",
      createdAt: "2026-07-23T00:00:00.000Z",
    },
  };
}

const DIGEST = `sha256:${"1".repeat(64)}` as const;
const BASE_OID = "b".repeat(40);

function exactBaseEvidence(overrides: {
  snapshot?: RemoteHeadSnapshotResult;
  objectAvailability?: ObjectAvailabilityResult;
  history?: { kind: "complete" } | { kind: "shallow" } | { kind: "unavailable"; reason: "execution" };
} = {}) {
  return {
    remoteSyncEnabled: true,
    snapshot: overrides.snapshot
      ?? { kind: "available" as const, scope: "all-heads" as const, tips: { main: BASE_OID } },
    objectAvailability: overrides.objectAvailability
      ?? { kind: "complete" as const, commits: { [BASE_OID]: true } },
    history: overrides.history ?? { kind: "complete" as const },
  };
}

const exec: GitExec = async (_command, args) => ({
  stdout: args[0] === "rev-parse" ? `${HEAD}\n` : "",
  stderr: "",
});
function authorizedDecision() {
  return {
    status: "authorized" as const,
    authorization: "discard-confirmed" as const,
    authorityVersion: DIGEST,
    evidence: {
      kind: "git-transition" as const,
      transition: "abandon" as const,
      resultDigest: DIGEST,
    },
    refs: { localOid: HEAD, remote: null },
  };
}

describe("projectRenameMoveRemedy", () => {
  it("projects exact argv and display text for valid registered path lag", () => {
    expect(projectRenameMoveRemedy(
      registered(),
      pendingMarker(),
      [registered()],
    )).toEqual({
      oldSlug: "old-name",
      newSlug: "new-name",
      branch: "feat/new-name",
      head: HEAD,
      from: "/wt/project.old-name",
      to: "/wt/project.new-name",
      remedy: {
        argv: ["git", "worktree", "move", "/wt/project.old-name", "/wt/project.new-name"],
        text: "Move the registered worktree from \"/wt/project.old-name\" to \"/wt/project.new-name\".",
      },
    });
  });

  it("keeps executable argv authoritative for paths containing shell metacharacters", () => {
    const from = "/wt/project old;touch-pwned";
    const to = "/wt/project new$(touch-pwned)";
    const worktree = registered({ path: from });
    const marker = pendingMarker({
      renameMovePending: {
        oldSlug: "old-name",
        newSlug: "new-name",
        branch: "feat/new-name",
        head: HEAD,
        from,
        to,
      },
    });
    expect(projectRenameMoveRemedy(worktree, marker, [worktree])?.remedy).toEqual({
      argv: ["git", "worktree", "move", from, to],
      text: `Move the registered worktree from ${JSON.stringify(from)} to ${JSON.stringify(to)}.`,
    });
  });

  it.each([
    ["wrong branch", registered({ branch: "feat/other" }), [registered({ branch: "feat/other" })]],
    ["moved HEAD", registered({ head: "1".repeat(40) }), [registered({ head: "1".repeat(40) })]],
    ["moved source", registered({ path: "/wt/elsewhere" }), [registered({ path: "/wt/elsewhere" })]],
    ["occupied target", registered(), [registered(), registered({ path: "/wt/project.new-name" })]],
    ["ambiguous branch", registered(), [registered(), registered({ path: "/wt/duplicate" })]],
  ] as const)("grants no remedy for %s", (_label, worktree, topology) => {
    expect(projectRenameMoveRemedy(worktree, pendingMarker(), topology)).toBeNull();
  });
});

describe("runLandedRetirementSweep", () => {
  function options() {
    return {
      topology: [registered({ path: "/wt/retired", branch: "feat/retired" })],
      markers: new Map([["/wt/retired", ownedMarker()]]),
      baseBranch: "main",
      protection: "partial" as const,
      exec,
      readBlob: async () => null,
      authorize: async () => authorizedDecision(),
      isClean: async () => true,
    };
  }

  it("offers ordinary teardown directly from structural abandon authority", async () => {
    const result = await runLandedRetirementSweep(options());

    expect(result.retirements).toEqual([{
      status: "actionable",
      worktreePath: "/wt/retired",
      lifecycle: {
        subject: { slug: "retired", branch: "feat/retired" },
        transition: "abandon",
        cleanup: {
          branch: { status: "pending" },
          worktree: { status: "pending" },
          userWorkspace: { status: "pending" },
        },
        successorReadiness: { candidates: [], actionable: true, remedy: null },
      },
      teardown: {
        argv: ["arc", "teardown", "retired"],
        text: "arc teardown retired",
      },
    }]);
    expect(result.retirements[0]).not.toHaveProperty("lifecycle.authority");
  });

  it("starts independent retirement proofs without waiting for an earlier candidate", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let secondStarted = false;
    const sweep = runLandedRetirementSweep({
      ...options(),
      topology: [
        registered({ path: "/wt/first", branch: "feat/first" }),
        registered({ path: "/wt/second", branch: "feat/second" }),
      ],
      markers: new Map([
        ["/wt/first", ownedMarker("first")],
        ["/wt/second", ownedMarker("second")],
      ]),
      authorize: async (request) => {
        if (request.subject.kind === "work-unit" && request.subject.name === "first") {
          await firstBlocked;
        } else {
          secondStarted = true;
          releaseFirst?.();
        }
        return authorizedDecision();
      },
    });

    try {
      const result = await Promise.race([
        sweep,
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error("independent proof did not start")), 100);
        }),
      ]);
      expect(secondStarted).toBe(true);
      expect(result.retirements).toHaveLength(2);
    } finally {
      releaseFirst?.();
      await sweep;
    }
  });

  it("reads the local integrating base under partial protection without fetching", async () => {
    const fetchBase = vi.fn(async () => true);
    const result = await runLandedRetirementSweep({ ...options(), fetchBase });

    expect(result.retirements).toHaveLength(1);
    expect(fetchBase).not.toHaveBeenCalled();
  });

  it("refreshes the remote base under full protection before authorization", async () => {
    const fetchBase = vi.fn(async () => true);
    const authorize = vi.fn(async () => authorizedDecision());
    const result = await runLandedRetirementSweep({
      ...options(),
      protection: "full",
      fetchBase,
      authorize,
    });

    expect(result.retirements).toHaveLength(1);
    expect(fetchBase).toHaveBeenCalledOnce();
    expect(authorize).toHaveBeenCalledOnce();
  });

  it.each(["full", "partial"] as const)(
    "keeps %s-protection cleanup manual when the selected base head is unreadable",
    async (protection) => {
      const authorize = vi.fn(async () => authorizedDecision());
      const result = await runLandedRetirementSweep({
        ...options(),
        protection,
        exec: async (_command, args) => {
          if (args[0] === "rev-parse") throw new Error("unreadable base");
          return { stdout: "", stderr: "" };
        },
        fetchBase: async () => true,
        authorize,
      });

      expect(result).toEqual({
        remoteEvidence: "not-applicable",
        retirements: [],
        warnings: [
          `Could not resolve lifecycle authority ref \`${protection === "full" ? "origin/main" : "main"}\`; `
            + "retirement cleanup remains manual.",
        ],
      });
      expect(authorize).not.toHaveBeenCalled();
    },
  );

  it("keeps dirty structurally authorized residue blocked", async () => {
    const result = await runLandedRetirementSweep({ ...options(), isClean: async () => false });

    expect(result.retirements).toEqual([{
      status: "blocked",
      worktreePath: "/wt/retired",
      subject: { slug: "retired", branch: "feat/retired" },
      reason: "uncommitted",
    }]);
  });

  it("ignores candidates with no structural retirement evidence", async () => {
    const result = await runLandedRetirementSweep({
      ...options(),
      authorize: async () => ({ status: "refused", reason: "evidence-missing" }),
    });

    expect(result).toEqual({ remoteEvidence: "not-applicable", retirements: [], warnings: [] });
  });

  it.each(["projection-mismatch", "authority-unavailable", "authority-ambiguous"] as const)(
    "blocks a candidate when structural retirement authorization refuses with %s",
    async (reason) => {
      const result = await runLandedRetirementSweep({
        ...options(),
        authorize: async () => ({ status: "refused", reason }),
      });

      expect(result.retirements).toEqual([{
        status: "blocked",
        worktreePath: "/wt/retired",
        subject: { slug: "retired", branch: "feat/retired" },
        reason,
      }]);
    },
  );

  it("does not turn a structural park proof into an abandon cleanup remedy", async () => {
    const result = await runLandedRetirementSweep({
      ...options(),
      authorize: async () => ({
        ...authorizedDecision(),
        authorization: "planning-relocated",
        evidence: {
          kind: "git-transition",
          transition: "park-planning",
          resultDigest: DIGEST,
        },
      }),
    });

    expect(result).toEqual({ remoteEvidence: "not-applicable", retirements: [], warnings: [] });
  });

  it("uses exact supplied base evidence without compatibility acquisition", async () => {
    const fetchBase = vi.fn(async () => true);
    const authorize = vi.fn(async () => authorizedDecision());
    const result = await runLandedRetirementSweep({
      ...options(),
      protection: "full",
      baseEvidence: exactBaseEvidence(),
      fetchBase,
      authorize,
    });

    expect(result.remoteEvidence).toBe("exact");
    expect(result.retirements).toHaveLength(1);
    expect(fetchBase).not.toHaveBeenCalled();
    expect(authorize).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: "pending base object",
      evidence: exactBaseEvidence({
        objectAvailability: { kind: "complete", commits: { [BASE_OID]: false } },
      }),
      remoteEvidence: "pending-fetch" as const,
    },
    {
      name: "unreachable remote",
      evidence: exactBaseEvidence({
        snapshot: { kind: "unreachable", failureReason: "network" },
      }),
      remoteEvidence: "unreachable" as const,
    },
    {
      name: "absent remote base",
      evidence: exactBaseEvidence({
        snapshot: { kind: "available", scope: "all-heads", tips: {} },
        objectAvailability: { kind: "complete", commits: {} },
      }),
      remoteEvidence: "exact" as const,
    },
  ])("blocks cleanup when supplied evidence has a $name", async ({ evidence, remoteEvidence }) => {
    const authorize = vi.fn(async () => authorizedDecision());
    const result = await runLandedRetirementSweep({
      ...options(),
      protection: "full",
      baseEvidence: evidence,
      authorize,
    });

    expect(result.remoteEvidence).toBe(remoteEvidence);
    expect(result.retirements).toEqual([{
      status: "blocked",
      worktreePath: "/wt/retired",
      subject: { slug: "retired", branch: "feat/retired" },
      reason: "evidence-unavailable",
    }]);
    expect(authorize).not.toHaveBeenCalled();
  });

  it("propagates uninspectable supplied history", async () => {
    await expect(runLandedRetirementSweep({
      ...options(),
      protection: "full",
      baseEvidence: exactBaseEvidence({ history: { kind: "unavailable", reason: "execution" } }),
    })).rejects.toThrow("Local retirement history completeness could not be inspected");
  });

  it("propagates unexpected exact-base authorization failures", async () => {
    await expect(runLandedRetirementSweep({
      ...options(),
      protection: "full",
      baseEvidence: exactBaseEvidence(),
      authorize: async () => { throw new Error("transition graph unavailable"); },
    })).rejects.toThrow("transition graph unavailable");
  });
});
