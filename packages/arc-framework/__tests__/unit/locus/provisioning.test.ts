/** Recoverable transient locus provisioning across checkout, marker, and record generations. */

import { describe, expect, it, vi } from "vitest";

import {
  provisionTransientLocus,
  type ProvisionTransientLocusDependencies,
  type ProvisionTransientLocusOptions,
} from "../../../src/lib/locus/provisioning.js";
import { PrimaryCheckoutResidueError } from "../../../src/lib/locus/provisioning-types.js";
import type { LocusAllocationPlan } from "../../../src/lib/locus/allocator.js";
import type { LocusIdentityV1, LocusRecordV1 } from "../../../src/lib/locus/schema/index.js";

const CLAIM_ID = "a".repeat(32);
const BRANCH = "chore/demo";
const WORKTREE_PATH = "/worktrees/demo";

const proposal: Extract<LocusAllocationPlan, { kind: "proposal" }> = {
  kind: "proposal",
  allocation: { kind: "spawn", primaryPath: "/repo" },
  subject: { kind: "errand", key: "demo", claimId: CLAIM_ID },
};

const identity: LocusIdentityV1 = {
  kind: "errand",
  key: "demo",
  claimId: CLAIM_ID,
  protection: "full",
  branch: BRANCH,
  purpose: "errand",
  origin: "description",
  originEntry: null,
  state: "open",
  savedHead: null,
  changeRequest: null,
};

function options(
  dependencies: ProvisionTransientLocusDependencies,
  overrides: Partial<ProvisionTransientLocusOptions> = {},
): ProvisionTransientLocusOptions {
  return {
    proposal,
    protection: "full",
    identity,
    branch: BRANCH,
    expectedBranchHead: null,
    base: "main",
    locationTemplate: "../{name}",
    repo: "arc-framework",
    spawningIdentity: "andrew",
    parentCheckoutPath: "/repo-wu",
    sessionHomePath: "/repo-wu",
    establishedAt: "2026-07-20T00:00:00.000Z",
    anchor: { kind: "process", pid: 10, startToken: "start", inspector: "linux", selector: "codex" },
    leaseId: "b".repeat(32),
    dependencies,
    ...overrides,
  };
}

function testHarness(
  events: string[],
  overrides: Partial<ProvisionTransientLocusDependencies> = {},
): {
  dependencies: ProvisionTransientLocusDependencies;
  marker(): Awaited<ReturnType<ProvisionTransientLocusDependencies["readMarker"]>>;
  record(): LocusRecordV1 | null;
} {
  let marker: Awaited<ReturnType<ProvisionTransientLocusDependencies["readMarker"]>> = { kind: "absent" };
  let record: { value: LocusRecordV1; bytes: Buffer } | null = null;
  const base: ProvisionTransientLocusDependencies = {
    createLinkedWorktree: async () => {
      events.push("create-worktree");
      return {
        kind: "created",
        receipt: {
          worktreePath: WORKTREE_PATH,
          branch: BRANCH,
          worktreeCreated: true,
          branchCreated: true,
          base: "main",
        },
      };
    },
    scanWorktrees: async () => {
      events.push("scan-roster");
      return {
        ok: true,
        worktrees: [{
          path: WORKTREE_PATH,
          head: "1".repeat(40),
          branch: BRANCH,
          detached: false,
          primary: false,
        }],
      };
    },
    readMarker: async () => marker,
    createMarker: async (_path, value) => {
      events.push("create-marker");
      if (marker.kind !== "absent") return { kind: "exists" };
      const bytes = Buffer.from(JSON.stringify(value));
      marker = { kind: "present", marker: value, bytes };
      return { kind: "created", bytes };
    },
    replaceMarker: async (_path, expectedBytes, value) => {
      events.push("replace-marker");
      if (marker.kind !== "present" || !marker.bytes.equals(expectedBytes)) {
        return { kind: "generation-mismatch" };
      }
      const bytes = Buffer.from(JSON.stringify(value));
      marker = { kind: "present", marker: value, bytes };
      return { kind: "replaced", bytes };
    },
    removeMarker: async (_path, expectedBytes) => {
      events.push("remove-marker");
      if (marker.kind !== "present" || !marker.bytes.equals(expectedBytes)) {
        return { kind: "generation-mismatch" };
      }
      marker = { kind: "absent" };
      return { kind: "removed" };
    },
    setupWorktree: async () => {
      events.push("setup-worktree");
    },
    acquireRecordLock: async () => ({
      kind: "acquired",
      handle: { recordId: `sha256:${"c".repeat(64)}`, recordPath: "/loci/demo.json", token: "lock" },
    }),
    releaseRecordLock: async () => {
      events.push("release-lock");
    },
    revalidateTarget: async () => ({ kind: "ready" }),
    checkoutPrimary: async () => ({
      kind: "applied", branchCreated: true, branch: BRANCH, previousBranch: "main", head: "1".repeat(40),
    }),
    rollbackPrimary: async () => ({ kind: "rolled-back" }),
    readRecord: async () => record === null
      ? { kind: "absent" }
      : { kind: "valid", record: record.value, bytes: record.bytes },
    mintRecord: async (_path, value) => {
      events.push("mint-record");
      if (record !== null) return { kind: "exists" };
      const bytes = Buffer.from(JSON.stringify(value));
      record = { value, bytes };
      return { kind: "created", bytes };
    },
    replaceRecord: async (_path, expectedBytes, value) => {
      events.push("replace-record");
      if (record === null || !record.bytes.equals(expectedBytes)) {
        return { kind: "generation-mismatch" };
      }
      const bytes = Buffer.from(JSON.stringify(value));
      record = { value, bytes };
      return { kind: "replaced", bytes };
    },
    removeRecord: async (_path, expectedBytes) => {
      events.push("remove-record");
      if (record === null || !record.bytes.equals(expectedBytes)) {
        return { kind: "generation-mismatch" };
      }
      record = null;
      return { kind: "removed" };
    },
    rollbackSpawned: async () => {
      events.push("rollback-worktree");
      return { kind: "rolled-back" };
    },
  };
  return {
    dependencies: { ...base, ...overrides },
    marker: () => marker,
    record: () => record?.value ?? null,
  };
}

describe("provisionTransientLocus", () => {
  it("reuses an exact retained branch when provisioning a resumed spawned locus", async () => {
    const events: string[] = [];
    const createLinkedWorktree = vi.fn(async () => ({
      kind: "created" as const,
      receipt: {
        worktreePath: WORKTREE_PATH,
        branch: BRANCH,
        worktreeCreated: true as const,
        branchCreated: false,
        base: null,
      },
    }));
    const harness = testHarness(events, { createLinkedWorktree });

    const result = await provisionTransientLocus(options(harness.dependencies, {
      expectedBranchHead: "1".repeat(40),
    }));

    expect(createLinkedWorktree).toHaveBeenCalledWith(expect.objectContaining({
      branch: BRANCH,
      createBranch: false,
    }));
    expect(result).toMatchObject({
      kind: "provisioned",
      receipt: { branch: { created: false, head: "1".repeat(40), base: null } },
    });
  });

  it("rolls back a resumed spawned checkout whose retained branch head changed", async () => {
    const events: string[] = [];
    const harness = testHarness(events, {
      createLinkedWorktree: async () => ({
        kind: "created",
        receipt: {
          worktreePath: WORKTREE_PATH,
          branch: BRANCH,
          worktreeCreated: true,
          branchCreated: false,
          base: null,
        },
      }),
    });

    const result = await provisionTransientLocus(options(harness.dependencies, {
      expectedBranchHead: "2".repeat(40),
    }));

    expect(result).toMatchObject({ kind: "refused", reason: "identity-conflict" });
    expect(events).toContain("rollback-worktree");
  });

  it("rolls back an unchanged created checkout when pending marker creation fails", async () => {
    const events: string[] = [];
    const harness = testHarness(events, {
      createMarker: async () => {
        events.push("create-marker");
        throw new Error("marker write failed");
      },
    });

    const result = await provisionTransientLocus(options(harness.dependencies));

    expect(result).toMatchObject({
      kind: "error",
      error: { message: "marker write failed" },
      evidence: { kind: "identity-only" },
    });
    expect(events).toEqual(["create-worktree", "scan-roster", "create-marker", "rollback-worktree"]);
  });

  it("rolls back the spawned checkout when the raced marker re-read fails", async () => {
    const events: string[] = [];
    let reads = 0;
    const harness = testHarness(events, {
      readMarker: async () => {
        events.push("read-marker");
        reads += 1;
        if (reads === 1) return { kind: "absent" };
        throw new Error("raced marker re-read failed");
      },
      createMarker: async () => {
        events.push("create-marker");
        return { kind: "exists" };
      },
    });

    const result = await provisionTransientLocus(options(harness.dependencies));

    expect(result).toMatchObject({
      kind: "error",
      error: { message: "raced marker re-read failed" },
      evidence: { kind: "identity-only" },
    });
    // The marker belongs to whichever session won the create, so the rollback
    // removes only this session's checkout.
    expect(events).toEqual([
      "create-worktree", "scan-roster", "read-marker", "create-marker", "read-marker", "rollback-worktree",
    ]);
  });

  it("does not rerun setup for a matching pending marker owned by another invocation", async () => {
    const events: string[] = [];
    const pending = {
      spawnedByArc: true,
      createdFor: { kind: "errand" as const, slug: "demo", claimId: CLAIM_ID },
      provisioning: "pending",
      spawningIdentity: "andrew",
      createdAt: "2026-07-20T00:00:00.000Z",
    };
    const bytes = Buffer.from(JSON.stringify(pending));
    const harness = testHarness(events, {
      createLinkedWorktree: async () => {
        events.push("create-worktree");
        return { kind: "refused", reason: "path-collision", worktreePath: WORKTREE_PATH };
      },
      readMarker: async () => ({ kind: "present", marker: pending, bytes }),
      setupWorktree: async () => {
        events.push("setup-worktree");
      },
    });

    const result = await provisionTransientLocus(options(harness.dependencies));

    expect(result).toEqual({
      kind: "refused",
      reason: "marker-conflict",
      evidence: { kind: "pending-marker", checkoutPath: WORKTREE_PATH, markerBytes: bytes },
    });
    expect(events).toEqual(["create-worktree", "scan-roster"]);
  });

  it("makes pending provenance visible during setup and removes it on an exact setup failure rollback", async () => {
    const events: string[] = [];
    const harness = testHarness(events);
    harness.dependencies.setupWorktree = async () => {
      events.push("setup-worktree");
      expect(harness.marker()).toMatchObject({
        kind: "present",
        marker: { provisioning: "pending", createdFor: { claimId: CLAIM_ID } },
      });
      throw new Error("harness copy failed");
    };

    const result = await provisionTransientLocus(options(harness.dependencies));

    expect(result).toMatchObject({
      kind: "error",
      error: { message: "harness copy failed" },
      evidence: { kind: "identity-only" },
    });
    expect(harness.marker()).toEqual({ kind: "absent" });
    expect(events).toEqual([
      "create-worktree", "scan-roster", "create-marker", "setup-worktree", "remove-marker", "rollback-worktree",
    ]);
  });

  it("preserves changed marker evidence and refuses to remove the created checkout", async () => {
    const events: string[] = [];
    const harness = testHarness(events, {
      setupWorktree: async () => {
        events.push("setup-worktree");
        throw new Error("setup failed after a marker race");
      },
      removeMarker: async () => {
        events.push("remove-marker");
        return { kind: "generation-mismatch" };
      },
    });

    const result = await provisionTransientLocus(options(harness.dependencies));

    expect(result).toMatchObject({
      kind: "error",
      evidence: { kind: "marker-record-mismatch", checkoutPath: WORKTREE_PATH },
    });
    expect(events).not.toContain("rollback-worktree");
  });

  it.each([
    ["live", "lock-live"], ["unknown", "lock-unknown"],
  ] as const)("leaves the spawned checkout in place when the record lock is %s", async (reason, expected) => {
    const events: string[] = [];
    const harness = testHarness(events, {
      acquireRecordLock: async () => ({ kind: "refused", reason }),
    });

    const result = await provisionTransientLocus(options(harness.dependencies));

    expect(result).toMatchObject({ kind: "refused", reason: expected });
    expect(events).not.toContain("rollback-worktree");
    expect(events).not.toContain("remove-marker");
  });

  it("preserves a conflicting role generation instead of adopting the same checkout", async () => {
    const events: string[] = [];
    const conflicting = {
      schemaVersion: 1,
      recordId: `sha256:${"c".repeat(64)}`,
      checkoutPath: WORKTREE_PATH,
      role: {
        kind: "errand",
        subject: { kind: "errand", key: "demo", claimId: "d".repeat(32) },
        establishedAt: "2026-07-19T00:00:00.000Z",
        parentCheckoutPath: null,
        originEntry: null,
      },
      lease: null,
    } satisfies LocusRecordV1;
    const bytes = Buffer.from(JSON.stringify(conflicting));
    const harness = testHarness(events, {
      readRecord: async () => ({ kind: "valid", record: conflicting, bytes }),
    });

    const result = await provisionTransientLocus(options(harness.dependencies));

    expect(result).toMatchObject({
      kind: "refused",
      reason: "role-conflict",
      evidence: { kind: "marker-record-mismatch" },
    });
    expect(events).not.toContain("remove-record");
    expect(events).not.toContain("rollback-worktree");
  });

  it("cleans its exact role, marker, and checkout generations after a lease race", async () => {
    const events: string[] = [];
    const harness = testHarness(events, {
      replaceRecord: async () => {
        events.push("replace-record");
        return { kind: "generation-mismatch" };
      },
    });

    const result = await provisionTransientLocus(options(harness.dependencies));

    expect(result).toMatchObject({
      kind: "refused",
      reason: "lease-generation-mismatch",
      evidence: { kind: "identity-only" },
    });
    expect(harness.record()).toBeNull();
    expect(harness.marker()).toEqual({ kind: "absent" });
    expect(events).toContain("rollback-worktree");
  });

  it("reports incomplete cleanup when its exact role generation changes before removal", async () => {
    const events: string[] = [];
    const harness = testHarness(events, {
      replaceRecord: async () => ({ kind: "generation-mismatch" }),
      removeRecord: async () => {
        events.push("remove-record");
        return { kind: "generation-mismatch" };
      },
    });

    const result = await provisionTransientLocus(options(harness.dependencies));

    expect(result).toMatchObject({
      kind: "refused",
      reason: "lease-generation-mismatch",
      evidence: { kind: "marker-record-mismatch", recordBytes: expect.any(Buffer) },
    });
    expect(events).not.toContain("remove-marker");
    expect(events).not.toContain("rollback-worktree");
  });

  it("holds the primary record lock across checkout failure and leaves identity-only evidence", async () => {
    const events: string[] = [];
    const primaryProposal: Extract<LocusAllocationPlan, { kind: "proposal" }> = {
      ...proposal,
      allocation: { kind: "primary", checkoutPath: "/repo" },
    };
    const harness = testHarness(events, {
      acquireRecordLock: async () => {
        events.push("acquire-lock");
        return {
          kind: "acquired",
          handle: { recordId: `sha256:${"e".repeat(64)}`, recordPath: "/loci/primary.json", token: "lock" },
        };
      },
      revalidateTarget: async () => {
        events.push("revalidate");
        return { kind: "ready" };
      },
      checkoutPrimary: async () => {
        events.push("checkout-primary");
        throw new Error("checkout failed");
      },
    });

    const result = await provisionTransientLocus(options(harness.dependencies, { proposal: primaryProposal }));

    expect(result).toMatchObject({
      kind: "error",
      error: { message: "checkout failed" },
      evidence: { kind: "identity-only" },
    });
    expect(events).toEqual(["acquire-lock", "revalidate", "checkout-primary", "release-lock"]);
  });

  it("carries an unreconciled primary checkout into marker-record-mismatch evidence", async () => {
    const events: string[] = [];
    const primaryProposal: Extract<LocusAllocationPlan, { kind: "proposal" }> = {
      ...proposal,
      allocation: { kind: "primary", checkoutPath: "/repo" },
    };
    const harness = testHarness(events, {
      acquireRecordLock: async () => {
        events.push("acquire-lock");
        return {
          kind: "acquired",
          handle: { recordId: `sha256:${"e".repeat(64)}`, recordPath: "/loci/primary.json", token: "lock" },
        };
      },
      revalidateTarget: async () => {
        events.push("revalidate");
        return { kind: "ready" };
      },
      checkoutPrimary: async () => {
        events.push("checkout-primary");
        throw new PrimaryCheckoutResidueError("/repo", new Error("fatal: cannot switch branches"));
      },
    });

    const result = await provisionTransientLocus(options(harness.dependencies, { proposal: primaryProposal }));

    expect(result).toMatchObject({
      kind: "error",
      evidence: { kind: "marker-record-mismatch", checkoutPath: "/repo", markerBytes: null, recordBytes: null },
    });
    expect(events).toEqual(["acquire-lock", "revalidate", "checkout-primary", "release-lock"]);
  });

  it("checks out and mints the primary role and lease in one markerless critical section", async () => {
    const events: string[] = [];
    const primaryProposal: Extract<LocusAllocationPlan, { kind: "proposal" }> = {
      ...proposal,
      allocation: { kind: "primary", checkoutPath: "/repo" },
    };
    const harness = testHarness(events, {
      acquireRecordLock: async () => {
        events.push("acquire-lock");
        return {
          kind: "acquired",
          handle: { recordId: `sha256:${"e".repeat(64)}`, recordPath: "/loci/primary.json", token: "lock" },
        };
      },
      revalidateTarget: async () => {
        events.push("revalidate");
        return { kind: "ready" };
      },
      checkoutPrimary: async () => {
        events.push("checkout-primary");
        return {
          kind: "applied", branchCreated: true, branch: BRANCH, previousBranch: "main", head: "1".repeat(40),
        };
      },
    });

    const result = await provisionTransientLocus(options(harness.dependencies, { proposal: primaryProposal }));

    expect(result).toMatchObject({
      kind: "provisioned",
      receipt: {
        allocation: "primary",
        checkoutPath: "/repo",
        marker: null,
        branch: { name: BRANCH, created: true },
        worktree: { path: "/repo", created: false },
      },
    });
    expect(harness.marker()).toEqual({ kind: "absent" });
    expect(events).toEqual([
      "acquire-lock", "revalidate", "checkout-primary", "mint-record", "replace-record", "release-lock",
    ]);
  });

  it("provisions a partial housekeep role on the markerless base checkout", async () => {
    const events: string[] = [];
    const partialProposal: Extract<LocusAllocationPlan, { kind: "proposal" }> = {
      kind: "proposal",
      allocation: { kind: "primary", checkoutPath: "/repo" },
      subject: { kind: "housekeep", key: "inbox-drain", claimId: null },
    };
    const harness = testHarness(events, {
      checkoutPrimary: async () => ({
        kind: "idempotent", branchCreated: false, branch: "main", previousBranch: "main", head: "1".repeat(40),
      }),
    });

    const result = await provisionTransientLocus(options(harness.dependencies, {
      proposal: partialProposal,
      protection: "partial",
      identity: null,
      authority: {
        kind: "partial-housekeep",
        key: "inbox-drain",
      },
      branch: null,
    }));

    expect(result).toMatchObject({
      kind: "provisioned",
      receipt: {
        allocation: "primary",
        marker: null,
        branch: { name: null, created: false },
      },
    });
    expect(harness.record()?.role).toMatchObject({
      kind: "housekeep",
      subject: { kind: "housekeep", key: "inbox-drain", claimId: null },
    });
  });

  it("refuses the same stable key with a different claimed generation before local effects", async () => {
    const events: string[] = [];
    const harness = testHarness(events);
    const staleIdentity = { ...identity, claimId: "f".repeat(32) };

    const result = await provisionTransientLocus(options(harness.dependencies, { identity: staleIdentity }));

    expect(result).toEqual({
      kind: "refused",
      reason: "identity-conflict",
      evidence: { kind: "identity-only" },
    });
    expect(events).toEqual([]);
  });

  it("refuses a path-unsafe identity key before creating a spawned checkout", async () => {
    const events: string[] = [];
    const harness = testHarness(events);
    const unsafeProposal = {
      ...proposal,
      subject: { ...proposal.subject, key: "../outside" },
    };
    const unsafeIdentity = { ...identity, key: "../outside" };

    const result = await provisionTransientLocus(options(harness.dependencies, {
      proposal: unsafeProposal,
      identity: unsafeIdentity,
    }));

    expect(result).toEqual({
      kind: "refused",
      reason: "identity-conflict",
      evidence: { kind: "identity-only" },
    });
    expect(events).toEqual([]);
  });

  it("replays an exact ready marker, role, and lease without recreating owned state", async () => {
    const events: string[] = [];
    let creationCount = 0;
    const harness = testHarness(events, {
      createLinkedWorktree: async () => {
        creationCount += 1;
        events.push("create-worktree");
        return creationCount === 1
          ? {
              kind: "created",
              receipt: {
                worktreePath: WORKTREE_PATH,
                branch: BRANCH,
                worktreeCreated: true,
                branchCreated: true,
                base: "main",
              },
            }
          : { kind: "refused", reason: "path-collision", worktreePath: WORKTREE_PATH };
      },
    });

    const first = await provisionTransientLocus(options(harness.dependencies));
    const second = await provisionTransientLocus(options(harness.dependencies));

    expect(first).toMatchObject({ kind: "provisioned", receipt: { worktree: { created: true } } });
    expect(second).toMatchObject({
      kind: "provisioned",
      receipt: {
        worktree: { created: false },
        branch: { created: false },
        leaseToken: "b".repeat(32),
      },
    });
    expect(events.filter((event) => event === "setup-worktree")).toHaveLength(1);
    expect(events.filter((event) => event === "mint-record")).toHaveLength(1);
  });
});
