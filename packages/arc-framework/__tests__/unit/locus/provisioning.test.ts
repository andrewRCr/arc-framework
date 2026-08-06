/** Marker-owned transient checkout provisioning and exact rollback. */

import { describe, expect, it } from "vitest";

import {
  provisionTransientLocus,
  type ProvisionTransientLocusDependencies,
  type ProvisionTransientLocusOptions,
} from "../../../src/lib/locus/provisioning.js";
import type { LocusAllocationPlan } from "../../../src/lib/locus/allocator.js";
import type { LocusIdentityV1 } from "../../../src/lib/locus/schema/identity.js";

const CLAIM_ID = "a".repeat(32);
const BRANCH = "chore/demo";
const WORKTREE_PATH = "/worktrees/demo";
const HEAD = "1".repeat(40);

const spawnedProposal: Extract<LocusAllocationPlan, { kind: "proposal" }> = {
  kind: "proposal",
  allocation: { kind: "spawn", primaryPath: "/repo" },
  subject: { kind: "errand", key: "demo", claimId: CLAIM_ID },
};
const primaryProposal: Extract<LocusAllocationPlan, { kind: "proposal" }> = {
  ...spawnedProposal,
  allocation: { kind: "primary", checkoutPath: "/repo" },
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
    proposal: spawnedProposal,
    protection: "full",
    identity,
    branch: BRANCH,
    expectedBranchHead: null,
    base: "main",
    locationTemplate: "../{name}",
    repo: "arc-framework",
    spawningIdentity: "andrew",
    parentCheckoutPath: "/repo-wu",
    establishedAt: "2026-07-20T00:00:00.000Z",
    dependencies,
    ...overrides,
  };
}

function harness(overrides: Partial<ProvisionTransientLocusDependencies> = {}) {
  const events: string[] = [];
  let marker: Awaited<ReturnType<ProvisionTransientLocusDependencies["readMarker"]>> = { kind: "absent" };
  let creationCount = 0;
  const dependencies: ProvisionTransientLocusDependencies = {
    withOperationLock: async (_cwd, operation) => {
      events.push("lock");
      try {
        return await operation();
      } finally {
        events.push("unlock");
      }
    },
    createLinkedWorktree: async () => {
      events.push("create-worktree");
      creationCount += 1;
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
    scanWorktrees: async () => {
      events.push("scan-roster");
      return {
        ok: true,
        worktrees: [{
          path: WORKTREE_PATH,
          head: HEAD,
          branch: BRANCH,
          detached: false,
          primary: false,
        }],
      };
    },
    revalidateTarget: async () => {
      events.push("revalidate");
      return { kind: "ready" };
    },
    readMarker: async () => marker,
    createMarker: async (_path, value) => {
      events.push("create-marker");
      if (marker.kind !== "absent") return { kind: "exists" };
      const bytes = Buffer.from(JSON.stringify(value));
      marker = { kind: "present", marker: value, bytes };
      return { kind: "created", bytes };
    },
    replaceMarker: async (_path, expected, value) => {
      events.push("replace-marker");
      if (marker.kind !== "present" || !marker.bytes.equals(expected)) {
        return { kind: "generation-mismatch" };
      }
      const bytes = Buffer.from(JSON.stringify(value));
      marker = { kind: "present", marker: value, bytes };
      return { kind: "replaced", bytes };
    },
    removeMarker: async (_path, expected) => {
      events.push("remove-marker");
      if (marker.kind !== "present" || !marker.bytes.equals(expected)) {
        return { kind: "generation-mismatch" };
      }
      marker = { kind: "absent" };
      return { kind: "removed" };
    },
    setupWorktree: async () => {
      events.push("setup-worktree");
    },
    checkoutPrimary: async () => {
      events.push("checkout-primary");
      return {
        kind: "applied",
        branchCreated: true,
        branch: BRANCH,
        previousBranch: "main",
        head: HEAD,
      };
    },
    rollbackPrimary: async () => ({ kind: "rolled-back" }),
    rollbackSpawned: async () => {
      events.push("rollback-worktree");
      return { kind: "rolled-back" };
    },
    ...overrides,
  };
  return { dependencies, events, marker: () => marker };
}

describe("provisionTransientLocus", () => {
  it("publishes a spawned checkout through its ready marker without durable record state", async () => {
    const test = harness();

    const result = await provisionTransientLocus(options(test.dependencies));

    expect(result).toMatchObject({
      kind: "provisioned",
      receipt: {
        disposition: "applied",
        allocation: "spawned",
        marker: { state: "ready" },
      },
    });
    expect(result.kind === "provisioned" ? Object.keys(result.receipt) : []).not.toContain("record");
    expect(result.kind === "provisioned" ? Object.keys(result.receipt) : []).not.toContain("leaseToken");
    expect(test.events).toEqual([
      "lock",
      "create-worktree",
      "scan-roster",
      "revalidate",
      "create-marker",
      "setup-worktree",
      "replace-marker",
      "unlock",
    ]);
  });

  it("replays an exact ready marker without rerunning checkout setup", async () => {
    const test = harness();

    const first = await provisionTransientLocus(options(test.dependencies));
    const second = await provisionTransientLocus(options(test.dependencies));

    expect(first).toMatchObject({ kind: "provisioned", receipt: { disposition: "applied" } });
    expect(second).toMatchObject({ kind: "provisioned", receipt: { disposition: "idempotent" } });
    expect(test.events.filter((event) => event === "setup-worktree")).toHaveLength(1);
    expect(test.marker()).toMatchObject({ kind: "present", marker: { provisioning: "ready" } });
  });

  it("rolls back its pending marker and created worktree when setup fails", async () => {
    const test = harness({
      setupWorktree: async () => {
        test.events.push("setup-worktree");
        throw new Error("setup failed");
      },
    });

    const result = await provisionTransientLocus(options(test.dependencies));

    expect(result).toMatchObject({ kind: "error", evidence: { kind: "identity-only" } });
    expect(test.events).toContain("remove-marker");
    expect(test.events).toContain("rollback-worktree");
    expect(test.marker()).toEqual({ kind: "absent" });
  });

  it("refuses and rolls back when a retained spawned branch changed head", async () => {
    const test = harness();

    const result = await provisionTransientLocus(options(test.dependencies, {
      expectedBranchHead: "2".repeat(40),
    }));

    expect(result).toMatchObject({ kind: "refused", reason: "identity-conflict" });
    expect(test.events).toContain("rollback-worktree");
  });

  it("publishes a primary checkout through a ready marker under the operation lock", async () => {
    const test = harness({
      scanWorktrees: async () => ({
        ok: true,
        worktrees: [{ path: "/repo", head: HEAD, branch: "main", detached: false, primary: true }],
      }),
    });

    const result = await provisionTransientLocus(options(test.dependencies, { proposal: primaryProposal }));

    expect(result).toMatchObject({
      kind: "provisioned",
      receipt: { allocation: "primary", checkoutPath: "/repo", marker: { state: "ready" } },
    });
    expect(test.events[0]).toBe("lock");
    expect(test.events.at(-1)).toBe("unlock");
  });

  it("removes its primary marker when checkout mutation fails", async () => {
    const test = harness({
      checkoutPrimary: async () => {
        throw new Error("checkout failed");
      },
    });

    const result = await provisionTransientLocus(options(test.dependencies, { proposal: primaryProposal }));

    expect(result).toMatchObject({ kind: "error", evidence: { kind: "identity-only" } });
    expect(test.marker()).toEqual({ kind: "absent" });
  });
});
