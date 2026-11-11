/** Marker-owned transient checkout provisioning and exact rollback. */

import { describe, expect, it, afterEach } from "vitest";

import {
  provisionTransientLocus,
  type ProvisionTransientLocusDependencies,
  type ProvisionTransientLocusOptions,
} from "../../../src/lib/locus/provisioning.js";
import type { LocusAllocationPlan } from "../../../src/lib/locus/allocator.js";
import type { WorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import type { LocusIdentityV1 } from "../../../src/lib/locus/schema/identity.js";
import { openOrdinaryErrandWithDisposition, type OpenOrdinaryErrandOptions } from "../../../src/lib/errand/open.js";
import type { OrdinaryErrandRecord } from "../../../src/lib/errand/identity-transitions.js";

import { beginProjectionCommand, projectionProcessState } from "../../../src/lib/store/projection/process-state.js";
afterEach(() => { beginProjectionCommand(); });

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
  let worktreePresent = false;
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
      if (creationCount === 1) worktreePresent = true;
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
          folderPresent: true,
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
      worktreePresent = false;
      return { kind: "rolled-back" };
    },
    lockSpawnedCheckout: async () => {
      events.push("lock-checkout");
      return { kind: "locked" };
    },
    ...overrides,
  };
  return { dependencies, events, marker: () => marker, hasWorktree: () => worktreePresent };
}

describe("provisionTransientLocus", () => {
  it.each(["spawn", "primary"] as const)("materializes a ready %s before completing provisioning", async allocation => {
    const test = harness();
    let observed: WorktreeMarker | null = null;
    projectionProcessState().materializeSpawn = async path => {
      const marker = await test.dependencies.readMarker(path);
      if (marker.kind === "present") observed = marker.marker;
    };
    const result = await provisionTransientLocus(options(test.dependencies, { proposal: allocation === "spawn" ? spawnedProposal : primaryProposal }));
    expect(result).toMatchObject({ kind: "provisioned" });
    expect(observed).toMatchObject({ provisioning: "ready", createdFor: { kind: "errand", slug: "demo" } });
  });

  it("keeps retained checkout evidence on an existing Errand claim through failure and repaired replay", async () => {
    let denied = true;
    let record: OrdinaryErrandRecord | null = null;
    const test = harness({ lockSpawnedCheckout: async () => denied
      ? { kind: "failed", detail: "lock denied" } : { kind: "locked" } });
    const row: Awaited<ReturnType<OpenOrdinaryErrandOptions["dependencies"]["readFrame"]>>["roster"][number] = {
      kind: "free-primary", subject: null,
      checkout: { folderPresent: true, path: "/repo", head: HEAD, branch: "main", detached: false, primary: true },
      markerGeneration: null, parentCheckoutPath: null, origin: null, identity: null, context: null,
      lifecycleLocation: null, diagnostics: [],
    };
    const request: OpenOrdinaryErrandOptions = {
      slug: "demo", intent: "repair output", protection: "full", base: "main",
      isolation: "require-isolation", createdAt: "2026-07-20T00:00:00.000Z",
      identityName: "andrew", locationTemplate: "../{name}", repo: "arc-framework",
      dependencies: {
        mintClaimId: () => CLAIM_ID,
        readFrame: async () => ({ roster: [row], entering: { kind: "selected", row },
          primaryAvailability: { kind: "free", checkoutPath: "/repo" },
          identityDiscovery: { kind: "complete", identities: [], diagnostics: [] }, active: null }),
        readIdentity: async () => ({ kind: "ready", record }),
        recoverOpen: async () => ({ kind: "ready", expectedBranchHead: HEAD }),
        claim: async (value) => { record = value; return { kind: "applied", record: value }; },
        rollbackClaim: async () => { throw new Error("A retained checkout must keep its claim"); },
        provision: (input) => provisionTransientLocus({ ...input, dependencies: test.dependencies }),
      },
    };
    const first = await openOrdinaryErrandWithDisposition(request);
    expect(first).toMatchObject({ result: { outcome: "error", error: { code: "locus.errand-open.provision" } },
      rollbackDisposition: "retained-or-unknown" });
    const originalClaim = record;
    const marker = test.marker();
    expect(marker).toMatchObject({ kind: "present", marker: { provisioning: "ready" } });
    const retry = await openOrdinaryErrandWithDisposition(request);
    expect(retry).toMatchObject({ result: { outcome: "error", error: { code: "locus.errand-open.provision" } },
      rollbackDisposition: "retained-or-unknown" });
    expect(record).toEqual(originalClaim);
    expect(test.marker()).toEqual(marker);
    expect(test.hasWorktree()).toBe(true);
    denied = false;
    expect(await openOrdinaryErrandWithDisposition(request)).toMatchObject({ result: { outcome: "idempotent",
      allocation: { kind: "spawned", checkoutPath: WORKTREE_PATH } }, rollbackDisposition: "not-required" });
    expect(record).toEqual(originalClaim);
    expect(test.marker()).toEqual(marker);
  });

  it.each(["returned", "thrown"])("retains a ready checkout after a %s lock failure and permits repaired replay", async (failure) => {
    let denied = true;
    const test = harness({ lockSpawnedCheckout: async () => {
      if (denied) {
        if (failure === "thrown") throw new Error("lock denied");
        return { kind: "failed", detail: "lock denied" };
      }
      return { kind: "locked" };
    } });
    const result = await provisionTransientLocus(options(test.dependencies));
    expect(result).toMatchObject({ kind: "error", evidence: { kind: "marker-residue", checkoutPath: WORKTREE_PATH } });
    if (result.kind !== "error") return;
    const marker = test.marker();
    expect(marker).toMatchObject({ kind: "present", marker: { provisioning: "ready" } });
    if (marker.kind !== "present") throw new Error("Missing retained ready marker");
    expect(result.evidence).toEqual({ kind: "marker-residue", checkoutPath: WORKTREE_PATH, markerBytes: marker.bytes });
    expect(result.error.message).toContain("lock denied");
    expect(result.error.message).toContain("git worktree lock --reason");
    expect(test.hasWorktree()).toBe(true);
    denied = false;
    expect(await provisionTransientLocus(options(test.dependencies))).toMatchObject({
      kind: "provisioned", receipt: { disposition: "idempotent", lock: { kind: "locked" } },
    });
    expect(test.marker()).toEqual(marker);
    expect(test.hasWorktree()).toBe(true);
  });

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
      "lock-checkout",
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

  it("preserves borrowed pending bytes when repeated setup fails and permits a later retry", async () => {
    let value: WorktreeMarker | null = {
      spawnedByArc: true, provisioning: "pending", spawningIdentity: "andrew",
      createdAt: "2026-07-20T00:00:00.000Z",
      createdFor: { kind: "errand", slug: "demo", claimId: CLAIM_ID },
    };
    let bytes = Buffer.from(JSON.stringify(value));
    const pendingBytes = Buffer.from(bytes);
    let setupFails = true;
    let setupCompletions = 0;
    const test = harness({
      createLinkedWorktree: async () => ({ kind: "refused", reason: "path-collision", worktreePath: WORKTREE_PATH }),
      readMarker: async () => value === null ? { kind: "absent" } : { kind: "present", marker: value, bytes },
      canResumePendingErrandCheckout: async () => true,
      removeMarker: async (_path, expected) => {
        if (!expected.equals(bytes)) return { kind: "generation-mismatch" };
        value = null;
        bytes = Buffer.alloc(0);
        return { kind: "removed" };
      },
      setupWorktree: async () => {
        if (setupFails) throw new Error("setup failed again");
        setupCompletions += 1;
      },
      replaceMarker: async (_path, expected, replacement) => {
        if (!expected.equals(bytes)) return { kind: "generation-mismatch" };
        value = replacement;
        bytes = Buffer.from(JSON.stringify(value));
        return { kind: "replaced", bytes };
      },
    });
    const request = options(test.dependencies, { expectedBranchHead: HEAD });
    const failed = await provisionTransientLocus(request);
    expect(failed).toMatchObject({ kind: "error" });
    expect(bytes).toEqual(pendingBytes);
    expect(value).toMatchObject({ provisioning: "pending" });
    expect(setupCompletions).toBe(0);
    setupFails = false;
    expect(await provisionTransientLocus(request)).toMatchObject({
      kind: "provisioned", receipt: { disposition: "applied", marker: { state: "ready" } },
    });
    expect(value).toMatchObject({ provisioning: "ready" });
    expect(setupCompletions).toBe(1);
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

  it("reports spawned residue truth when target revalidation throws", async () => {
    const test = harness({
      revalidateTarget: async () => {
        test.events.push("revalidate");
        throw new Error("revalidation failed");
      },
    });

    const result = await provisionTransientLocus(options(test.dependencies));

    expect(result).toMatchObject({ kind: "error", evidence: { kind: "identity-only" } });
    expect(test.events).toContain("rollback-worktree");
  });

  it("reports a created checkout residue when revalidation rollback fails", async () => {
    const test = harness({
      revalidateTarget: async () => {
        throw new Error("revalidation failed");
      },
      rollbackSpawned: async () => ({ kind: "generation-mismatch" }),
    });

    const result = await provisionTransientLocus(options(test.dependencies));

    expect(result).toMatchObject({
      kind: "error",
      evidence: { kind: "marker-residue", checkoutPath: WORKTREE_PATH, markerBytes: null },
    });
  });

  it("publishes a primary checkout through a ready marker under the operation lock", async () => {
    const test = harness({
      scanWorktrees: async () => ({
        ok: true,
        worktrees: [{ folderPresent: true, path: "/repo", head: HEAD, branch: "main", detached: false, primary: true }],
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

it("provisions a partial Errand with the qualified entry's observed version", async () => {
  const test = harness();
  const result = await provisionTransientLocus(options(test.dependencies, {
    protection: "partial", identity: null,
    proposal: { ...primaryProposal, subject: { kind: "errand", key: "demo", claimId: null } },
    authority: { kind: "partial-errand", key: "demo", originEntry: "personal:abcd1234", originEntryVersion: "v1:0123456789abcdef" },
  }));
  expect(result.kind).toBe("provisioned");
  expect(test.marker()).toMatchObject({ kind: "present", marker: { originEntry: "personal:abcd1234",
    originEntryVersion: "v1:0123456789abcdef" } });
});
