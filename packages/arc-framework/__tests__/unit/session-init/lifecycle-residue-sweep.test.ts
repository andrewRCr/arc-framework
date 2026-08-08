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
import type { RetirementReceipt } from "../../../src/lib/work-unit/retirement-authority.js";
import type { RetirementRecordEnumerationResult } from "../../../src/lib/work-unit/retirement-record-enumeration.js";

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

function abandonReceipt(): RetirementReceipt {
  return {
    schemaVersion: 2,
    receiptId: DIGEST,
    subject: { kind: "work-unit", name: "retired" },
    transition: "abandon",
    source: {
      branch: "feat/retired",
      head: HEAD,
      artifactDigest: DIGEST,
    },
    transitionPatchDigest: DIGEST,
    retiringProjection: { kind: "direct-transition" },
    authorization: "discard-confirmed",
    result: { kind: "discard", artifactDigest: "absent" },
    inventoryRead: "reachable",
  };
}

function enumerated(receipt: RetirementReceipt): RetirementRecordEnumerationResult {
  return {
    status: "valid",
    records: [{
      id: receipt.receiptId,
      content: "{}",
      record: { kind: "receipt", value: receipt },
    }],
  };
}

function enumeratedMany(receipts: readonly RetirementReceipt[]): RetirementRecordEnumerationResult {
  return {
    status: "valid",
    records: receipts.map((receipt) => ({
      id: receipt.receiptId,
      content: "{}",
      record: { kind: "receipt" as const, value: receipt },
    })),
  };
}

function noRecords(): RetirementRecordEnumerationResult {
  return { status: "valid", records: [] };
}

const exec: GitExec = async () => ({ stdout: "", stderr: "" });

function exactBaseEvidence(baseOid = "b".repeat(40)): {
  remoteSyncEnabled: boolean;
  snapshot: RemoteHeadSnapshotResult;
  objectAvailability: ObjectAvailabilityResult;
  history: { kind: "complete" };
} {
  return {
    remoteSyncEnabled: true,
    snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
    objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
    history: { kind: "complete" },
  };
}

function authorizedDecision() {
  return {
    status: "authorized" as const,
    authorization: "discard-confirmed" as const,
    authorityVersion: DIGEST,
    evidence: {
      kind: "receipt" as const,
      receiptId: DIGEST,
      transition: "abandon" as const,
      expectedLifecycle: "nonexistent" as const,
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
  it("authorizes landed retirement only from the exact advertised base", async () => {
    const baseOid = "b".repeat(40);
    const localOnlyExec: GitExec = async (_command, args, options) => {
      if (args[0] === "fetch") throw new Error("session inspection must not fetch");
      if (options?.objectAccess !== "local-only") throw new Error("object access was not local-only");
      return { stdout: "", stderr: "" };
    };

    const result = await runLandedRetirementSweep({
      roster: { entries: [], warnings: [] },
      topology: [registered({ path: "/wt/retired", branch: "feat/retired" })],
      markers: new Map([["/wt/retired", ownedMarker()]]),
      baseBranch: "main",
      protection: "full",
      exec: localOnlyExec,
      readBlob: async () => null,
      baseEvidence: {
        remoteSyncEnabled: true,
        snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
        objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
        history: { kind: "complete" },
      },
      enumerateRecords: async (ref) => ref === baseOid ? enumerated(abandonReceipt()) : noRecords(),
      authorize: async () => authorizedDecision(),
      isClean: async () => true,
    });

    expect(result.retirements[0]?.status).toBe("actionable");
    expect(result.remoteEvidence).toBe("exact");
  });

  it.each([
    {
      name: "pending-fetch",
      evidence: {
        ...exactBaseEvidence(),
        objectAvailability: { kind: "complete", commits: { ["b".repeat(40)]: false } },
      },
      remoteEvidence: "pending-fetch" as const,
    },
    {
      name: "unreachable",
      evidence: {
        ...exactBaseEvidence(),
        snapshot: { kind: "unreachable", failureReason: "network" },
      },
      remoteEvidence: "unreachable" as const,
    },
    {
      name: "remote-base-absent",
      evidence: {
        ...exactBaseEvidence(),
        snapshot: { kind: "available", scope: "all-heads", tips: {} },
        objectAvailability: { kind: "complete", commits: {} },
      },
      remoteEvidence: "exact" as const,
    },
  ] satisfies Array<{
    name: string;
    evidence: ReturnType<typeof exactBaseEvidence>;
    remoteEvidence: "pending-fetch" | "unreachable" | "exact";
  }>)("keeps retirement blocked without teardown for $name evidence", async ({ evidence, remoteEvidence }) => {
    const result = await runLandedRetirementSweep({
      roster: { entries: [], warnings: [] },
      topology: [registered({ path: "/wt/retired", branch: "feat/retired" })],
      markers: new Map([["/wt/retired", ownedMarker()]]),
      baseBranch: "main",
      protection: "full",
      exec,
      readBlob: async () => null,
      baseEvidence: evidence,
      enumerateRecords: async () => enumerated(abandonReceipt()),
      authorize: async () => authorizedDecision(),
      isClean: async () => true,
    });

    expect(result.retirements).toEqual([{
      status: "blocked",
      worktreePath: "/wt/retired",
      subject: { slug: "retired", branch: "feat/retired" },
      reason: "evidence-unavailable",
    }]);
    expect(result.remoteEvidence).toBe(remoteEvidence);
    expect(result.retirements[0]).not.toHaveProperty("teardown");
  });

  it("propagates an unexpected exact-base retirement-record failure", async () => {
    await expect(runLandedRetirementSweep({
      roster: { entries: [], warnings: [] },
      topology: [registered({ path: "/wt/retired", branch: "feat/retired" })],
      markers: new Map([["/wt/retired", ownedMarker()]]),
      baseBranch: "main",
      protection: "full",
      exec,
      readBlob: async () => null,
      baseEvidence: exactBaseEvidence(),
      enumerateRecords: async () => { throw new Error("retirement records failed"); },
      authorize: async () => authorizedDecision(),
      isClean: async () => true,
    })).rejects.toThrow("retirement records failed");
  });

  it("enumerates exact-base retirement records with local-only object access", async () => {
    const result = await runLandedRetirementSweep({
      roster: { entries: [], warnings: [] },
      topology: [registered({ path: "/wt/retired", branch: "feat/retired" })],
      markers: new Map([["/wt/retired", ownedMarker()]]),
      baseBranch: "main",
      protection: "full",
      exec: async (_command, args, options) => {
        if (args[0] !== "ls-tree") throw new Error(`unexpected git call: ${args.join(" ")}`);
        if (options?.objectAccess !== "local-only") throw new Error("record access was not local-only");
        return { stdout: "", stderr: "" };
      },
      readBlob: async () => null,
      baseEvidence: exactBaseEvidence(),
      authorize: async () => authorizedDecision(),
      isClean: async () => true,
    });

    expect(result).toEqual({ remoteEvidence: "exact", retirements: [], warnings: [] });
  });

  it("propagates a missing required retirement-index blob from a local base commit", async () => {
    const recordOid = "c".repeat(40);
    await expect(runLandedRetirementSweep({
      roster: { entries: [], warnings: [] },
      topology: [registered({ path: "/wt/retired", branch: "feat/retired" })],
      markers: new Map([["/wt/retired", ownedMarker()]]),
      baseBranch: "main",
      protection: "full",
      exec: async (_command, args, options) => {
        if (options?.objectAccess !== "local-only") throw new Error("blob access was not local-only");
        if (args[0] === "ls-tree") {
          return {
            stdout: `100644 blob ${recordOid}\t.arc/system/.internal/retirement-receipts/sha256-${"1".repeat(64)}.json\0`,
            stderr: "",
          };
        }
        if (args[0] === "show" && args[1] === recordOid) throw new Error("required blob missing");
        throw new Error(`unexpected git call: ${args.join(" ")}`);
      },
      readBlob: async () => null,
      baseEvidence: exactBaseEvidence(),
      authorize: async () => authorizedDecision(),
      isClean: async () => true,
    })).rejects.toThrow("required blob missing");
  });

  it("lets landed retirement authority supersede stale branch-local active metadata", async () => {
    const enumerateRecords = vi.fn(async () => enumerated(abandonReceipt()));

    const result = await runLandedRetirementSweep({
      roster: {
        entries: [{
          worktreePath: "/wt/retired",
          branch: "feat/retired",
          metaFilePath: "/wt/retired/.arc/active/meta-retired.md",
        }],
        warnings: [],
      },
      topology: [registered({ path: "/wt/retired", branch: "feat/retired" })],
      markers: new Map([["/wt/retired", ownedMarker()]]),
      baseBranch: "main",
      protection: "full",
      exec,
      readBlob: async () => null,
      enumerateRecords,
      authorize: async () => authorizedDecision(),
      isClean: async () => true,
    });

    expect(result.retirements).toHaveLength(1);
    expect(result.retirements[0]).toMatchObject({
      status: "actionable",
      lifecycle: { subject: { slug: "retired", branch: "feat/retired" } },
    });
    expect(enumerateRecords).toHaveBeenCalledWith("origin/main");
  });

  it("offers ordinary teardown only from unique base-reachable receipt authority", async () => {
    const enumerateRecords = vi.fn(async () => enumerated(abandonReceipt()));
    const authorize = vi.fn(async () => authorizedDecision());

    const result = await runLandedRetirementSweep({
      roster: { entries: [], warnings: [] },
      topology: [registered({ path: "/wt/retired", branch: "feat/retired" })],
      markers: new Map([["/wt/retired", ownedMarker()]]),
      baseBranch: "main",
      protection: "full",
      exec,
      readBlob: async () => null,
      enumerateRecords,
      authorize,
      isClean: async () => true,
    });

    expect(enumerateRecords).toHaveBeenCalledWith("origin/main");
    expect(result.retirements).toEqual([{
      status: "actionable",
      worktreePath: "/wt/retired",
      lifecycle: {
        subject: { slug: "retired", branch: "feat/retired" },
        transition: "abandon",
        authority: { kind: "receipt-backed", receiptId: DIGEST, authorityVersion: DIGEST },
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
  });

  it("selects the exact authorized receipt among same-slug history", async () => {
    const exact = abandonReceipt();
    const historical: RetirementReceipt = {
      ...exact,
      receiptId: `sha256:${"2".repeat(64)}`,
      source: {
        ...exact.source,
        branch: "feat/retired-old",
        head: "2".repeat(40),
      },
    };
    const result = await runLandedRetirementSweep({
      roster: { entries: [], warnings: [] },
      topology: [registered({ path: "/wt/retired", branch: "feat/retired" })],
      markers: new Map([["/wt/retired", ownedMarker()]]),
      baseBranch: "main",
      protection: "partial",
      exec,
      readBlob: async () => null,
      enumerateRecords: async () => enumeratedMany([historical, exact]),
      authorize: async () => authorizedDecision(),
      isClean: async () => true,
    });

    expect(result.retirements).toHaveLength(1);
    expect(result.retirements[0]).toMatchObject({
      status: "actionable",
      lifecycle: {
        transition: "abandon",
        authority: { receiptId: DIGEST },
      },
    });
  });

  it("blocks when authorization names a receipt absent from the enumerated base", async () => {
    const historical: RetirementReceipt = {
      ...abandonReceipt(),
      receiptId: `sha256:${"2".repeat(64)}`,
    };
    const result = await runLandedRetirementSweep({
      roster: { entries: [], warnings: [] },
      topology: [registered({ path: "/wt/retired", branch: "feat/retired" })],
      markers: new Map([["/wt/retired", ownedMarker()]]),
      baseBranch: "main",
      protection: "partial",
      exec,
      readBlob: async () => null,
      enumerateRecords: async () => enumerated(historical),
      authorize: async () => authorizedDecision(),
      isClean: async () => true,
    });

    expect(result.retirements).toEqual([{
      status: "blocked",
      worktreePath: "/wt/retired",
      subject: { slug: "retired", branch: "feat/retired" },
      reason: "evidence-mismatch",
    }]);
  });

  it("grants no cleanup or successor action for branch-local evidence absent from the full-protection base", async () => {
    const authorize = vi.fn(async () => authorizedDecision());

    const result = await runLandedRetirementSweep({
      roster: { entries: [], warnings: [] },
      topology: [registered({ path: "/wt/retired", branch: "feat/retired" })],
      markers: new Map([["/wt/retired", ownedMarker()]]),
      baseBranch: "main",
      protection: "full",
      exec,
      readBlob: async () => null,
      enumerateRecords: async () => noRecords(),
      authorize,
      isClean: async () => true,
    });

    expect(result).toEqual({ remoteEvidence: "not-applicable", retirements: [], warnings: [] });
    expect(authorize).not.toHaveBeenCalled();
  });

  it("reads the local integrating base under partial protection without remote acquisition", async () => {
    const enumerateRecords = vi.fn(async (ref: string) => ref === "main"
      ? enumerated(abandonReceipt())
      : noRecords());

    const result = await runLandedRetirementSweep({
      roster: { entries: [], warnings: [] },
      topology: [registered({ path: "/wt/retired", branch: "feat/retired" })],
      markers: new Map([["/wt/retired", ownedMarker()]]),
      baseBranch: "main",
      protection: "partial",
      exec,
      readBlob: async () => null,
      enumerateRecords,
      authorize: async () => authorizedDecision(),
      isClean: async () => true,
    });

    expect(result.retirements[0]?.status).toBe("actionable");
  });

  it("propagates a local graph failure while correlating refused retirement evidence", async () => {
    const parent = "2".repeat(40);
    const receipt: RetirementReceipt = {
      ...abandonReceipt(),
      source: { ...abandonReceipt().source, head: parent },
    };

    await expect(runLandedRetirementSweep({
      roster: { entries: [], warnings: [] },
      topology: [registered({ path: "/wt/retired", branch: "feat/retired" })],
      markers: new Map([["/wt/retired", ownedMarker()]]),
      baseBranch: "main",
      protection: "full",
      exec: async (_command, args) => {
        if (args[0] === "rev-list") throw new Error("graph failed");
        return { stdout: "", stderr: "" };
      },
      readBlob: async () => null,
      baseEvidence: exactBaseEvidence(),
      enumerateRecords: async () => enumerated(receipt),
      authorize: async () => ({ status: "refused", reason: "authority-unavailable" }),
      isClean: async () => true,
    })).rejects.toThrow("graph failed");
  });

  it("keeps dirty receipt-backed residue blocked and grants no teardown", async () => {
    const authorize = vi.fn(async () => authorizedDecision());
    const result = await runLandedRetirementSweep({
      roster: { entries: [], warnings: [] },
      topology: [registered({ path: "/wt/retired", branch: "feat/retired" })],
      markers: new Map([["/wt/retired", ownedMarker()]]),
      baseBranch: "main",
      protection: "partial",
      exec,
      readBlob: async () => null,
      enumerateRecords: async () => enumerated(abandonReceipt()),
      authorize,
      isClean: async () => false,
    });

    expect(result.retirements).toEqual([{
      status: "blocked",
      worktreePath: "/wt/retired",
      subject: { slug: "retired", branch: "feat/retired" },
      reason: "uncommitted",
    }]);
    expect(authorize).toHaveBeenCalledOnce();
  });

  it("ignores same-slug history when the active worktree has no exact retirement authority", async () => {
    const historical: RetirementReceipt = {
      ...abandonReceipt(),
      receiptId: `sha256:${"2".repeat(64)}`,
      source: {
        ...abandonReceipt().source,
        branch: "feat/retired-old",
        head: "2".repeat(40),
      },
    };
    const result = await runLandedRetirementSweep({
      roster: { entries: [], warnings: [] },
      topology: [registered({ path: "/wt/retired", branch: "feat/retired" })],
      markers: new Map([["/wt/retired", ownedMarker()]]),
      baseBranch: "main",
      protection: "partial",
      exec,
      readBlob: async () => null,
      enumerateRecords: async () => enumerated(historical),
      authorize: async () => ({ status: "refused", reason: "evidence-mismatch" }),
      isClean: async () => true,
    });

    expect(result.retirements).toEqual([]);
  });

  it("ignores same-branch abandon history whose source HEAD cannot be the current direct-transition parent", async () => {
    const result = await runLandedRetirementSweep({
      roster: { entries: [], warnings: [] },
      topology: [registered({ path: "/wt/retired", branch: "feat/retired" })],
      markers: new Map([["/wt/retired", ownedMarker()]]),
      baseBranch: "main",
      protection: "partial",
      exec,
      readBlob: async () => null,
      enumerateRecords: async () => enumerated(abandonReceipt()),
      authorize: async () => ({ status: "refused", reason: "evidence-mismatch" }),
      isClean: async () => true,
    });

    expect(result.retirements).toEqual([]);
  });

  it.each([
    "projection-mismatch",
    "authority-unavailable",
  ] as const)("blocks a plausible current receipt when authorization refuses with %s", async (reason) => {
    const parent = "2".repeat(40);
    const receipt: RetirementReceipt = {
      ...abandonReceipt(),
      source: {
        ...abandonReceipt().source,
        head: parent,
      },
    };
    const result = await runLandedRetirementSweep({
      roster: { entries: [], warnings: [] },
      topology: [registered({ path: "/wt/retired", branch: "feat/retired" })],
      markers: new Map([["/wt/retired", ownedMarker()]]),
      baseBranch: "main",
      protection: "partial",
      exec: async (_command, args) => args[0] === "rev-list"
        ? { stdout: `${HEAD} ${parent}\n`, stderr: "" }
        : { stdout: "", stderr: "" },
      readBlob: async () => null,
      enumerateRecords: async () => enumerated(receipt),
      authorize: async () => ({ status: "refused", reason }),
      isClean: async () => true,
    });

    expect(result.retirements).toEqual([{
      status: "blocked",
      worktreePath: "/wt/retired",
      subject: { slug: "retired", branch: "feat/retired" },
      reason,
    }]);
  });

});
