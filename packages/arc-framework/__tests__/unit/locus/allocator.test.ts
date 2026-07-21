/** Protection-aware locus allocation planning and linearization. */

import { describe, expect, it } from "vitest";

import {
  linearizePrimaryAllocation,
  planLocusAllocation,
  type LocusAllocationLock,
  type LocusAllocationPlan,
  type PrimaryAllocationDependencies,
} from "../../../src/lib/locus/allocator.js";
import type { LocusStateV1 } from "../../../src/lib/locus/schema/index.js";

const SUBJECT = { kind: "errand", key: "docs", claimId: "a".repeat(32) } as const;
const PARTIAL_SUBJECT = { ...SUBJECT, claimId: null } as const;

function state(primaryAvailability: LocusStateV1["primaryAvailability"]): LocusStateV1 {
  return {
    roster: { mode: "locus", ok: true, primaryPath: "/repo", rows: [], diagnostics: [] },
    current: { kind: "none" },
    primaryAvailability,
    inFlightIdentities: [],
    recovery: { kind: "none" },
    reconciliation: { kind: "clean" },
  };
}

describe("planLocusAllocation", () => {
  it("proposes the free primary when isolation is not requested", () => {
    expect(planLocusAllocation({
      state: state({ kind: "free", checkoutPath: "/repo" }),
      protection: "full",
      isolation: "prefer-primary",
      subject: SUBJECT,
    })).toEqual({
      kind: "proposal",
      allocation: { kind: "primary", checkoutPath: "/repo" },
      subject: SUBJECT,
    });
  });

  it("spawns for explicit isolation only under full protection", () => {
    const free = state({ kind: "free", checkoutPath: "/repo" });
    expect(planLocusAllocation({
      state: free,
      protection: "full",
      isolation: "require-isolation",
      subject: SUBJECT,
    })).toMatchObject({ kind: "proposal", allocation: { kind: "spawn", primaryPath: "/repo" } });
    expect(planLocusAllocation({
      state: free,
      protection: "partial",
      isolation: "require-isolation",
      subject: PARTIAL_SUBJECT,
    })).toEqual({ kind: "refused", reason: "full-protection-required" });
  });

  it.each([
    ["absent", "primary-occupied"],
    ["live", "lease-live"],
    ["dead", "primary-occupied"],
    ["unknown", "lease-unknown"],
  ] as const)("spawns for an occupied %s lease under full protection and refuses partial", (leaseState, reason) => {
    const occupied = state({
      kind: "occupied",
      checkoutPath: "/repo",
      recordId: `sha256:${"b".repeat(64)}`,
      leaseState,
    });
    expect(planLocusAllocation({
      state: occupied,
      protection: "full",
      isolation: "prefer-primary",
      subject: SUBJECT,
    })).toMatchObject({ kind: "proposal", allocation: { kind: "spawn" } });
    expect(planLocusAllocation({
      state: occupied,
      protection: "partial",
      isolation: "prefer-primary",
      subject: PARTIAL_SUBJECT,
    })).toEqual({ kind: "refused", reason });
  });

  it.each([
    ["primary-dirty", "primary-dirty"],
    ["primary-off-base", "primary-off-base"],
  ] as const)("refuses %s primary state under either protection mode", (stopReason, refusal) => {
    const unsafe = state({ kind: "unsafe", checkoutPath: "/repo", reasons: [stopReason] });
    for (const protection of ["full", "partial"] as const) {
      expect(planLocusAllocation({
        state: unsafe,
        protection,
        isolation: "prefer-primary",
        subject: protection === "full" ? SUBJECT : PARTIAL_SUBJECT,
      })).toEqual({ kind: "refused", reason: refusal });
    }
  });

  it.each([
    ["record-malformed", "record-malformed"],
    ["duplicate-locus", "duplicate-locus"],
    ["lock-unknown", "topology-unknown"],
  ] as const)("refuses unsafe %s evidence without offering a spawn", (stopReason, refusal) => {
    const unsafe = state({ kind: "unsafe", checkoutPath: "/repo", reasons: [stopReason] });
    for (const protection of ["full", "partial"] as const) {
      expect(planLocusAllocation({
        state: unsafe,
        protection,
        isolation: "prefer-primary",
        subject: protection === "full" ? SUBJECT : PARTIAL_SUBJECT,
      })).toEqual({ kind: "refused", reason: refusal });
    }
  });

  it("keeps partial Errand and housekeep identity-free while carrying a groom claim", () => {
    const free = state({ kind: "free", checkoutPath: "/repo" });
    for (const subject of [SUBJECT, { kind: "housekeep" as const, key: "sweep", claimId: "b".repeat(32) }]) {
      expect(planLocusAllocation({
        state: free,
        protection: "partial",
        isolation: "prefer-primary",
        subject,
      })).toEqual({ kind: "refused", reason: "identity-conflict" });
    }
    expect(planLocusAllocation({
      state: free,
      protection: "partial",
      isolation: "prefer-primary",
      subject: { kind: "groom", key: "anchor", claimId: "c".repeat(32) },
    })).toMatchObject({ kind: "proposal", allocation: { kind: "primary" } });
  });
});

function primaryProposal(): Extract<LocusAllocationPlan, { kind: "proposal" }> {
  const result = planLocusAllocation({
    state: state({ kind: "free", checkoutPath: "/repo" }),
    protection: "full",
    isolation: "prefer-primary",
    subject: SUBJECT,
  });
  if (result.kind !== "proposal") throw new Error("expected proposal");
  return result;
}

function allocationDependencies(options: {
  events: string[];
  readState?: () => Promise<LocusStateV1>;
  readGitSafety?: () => Promise<{ kind: "complete"; clean: boolean; onBase: boolean; branch: string }>;
  apply?: () => Promise<string>;
}): PrimaryAllocationDependencies<string, string> {
  const lock: LocusAllocationLock = {
    release: async () => { options.events.push("release-lock"); },
  };
  return {
    prepareRemote: async () => {
      options.events.push("prepare-remote");
      return "claim";
    },
    rollbackRemote: async () => { options.events.push("rollback-remote"); },
    acquireLock: async () => {
      options.events.push("acquire-lock");
      return lock;
    },
    readState: options.readState ?? (async () => {
      options.events.push("read-state");
      return state({ kind: "free", checkoutPath: "/repo" });
    }),
    readGitSafety: options.readGitSafety ?? (async () => {
      options.events.push("read-git");
      return { kind: "complete", clean: true, onBase: true, branch: "main" };
    }),
    applyLocal: async () => {
      options.events.push("apply-local");
      return options.apply?.() ?? "allocated";
    },
  };
}

describe("linearizePrimaryAllocation", () => {
  it("keeps remote prepare and rollback outside the owned local lock", async () => {
    const events: string[] = [];
    const result = await linearizePrimaryAllocation({
      proposal: primaryProposal(),
      protection: "full",
      isolation: "prefer-primary",
      dependencies: allocationDependencies({
        events,
        readState: async () => {
          events.push("read-state");
          return state({
            kind: "occupied",
            checkoutPath: "/repo",
            recordId: `sha256:${"c".repeat(64)}`,
            leaseState: "live",
          });
        },
      }),
    });

    expect(result).toEqual({ kind: "refused", reason: "lease-live" });
    expect(events).toEqual([
      "prepare-remote",
      "acquire-lock",
      "read-state",
      "read-git",
      "release-lock",
      "rollback-remote",
    ]);
  });

  it.each([
    [false, true, "primary-dirty"],
    [true, false, "primary-off-base"],
  ] as const)("refuses changed Git facts under lock", async (clean, onBase, reason) => {
    const events: string[] = [];
    const result = await linearizePrimaryAllocation({
      proposal: primaryProposal(),
      protection: "full",
      isolation: "prefer-primary",
      dependencies: allocationDependencies({
        events,
        readGitSafety: async () => {
          events.push("read-git");
          return { kind: "complete", clean, onBase, branch: onBase ? "main" : "feature" };
        },
      }),
    });

    expect(result).toEqual({ kind: "refused", reason });
    expect(events.at(-2)).toBe("release-lock");
    expect(events.at(-1)).toBe("rollback-remote");
  });

  it("allows only the first of two recordless-primary contenders to linearize", async () => {
    let current = state({ kind: "free", checkoutPath: "/repo" });
    const run = async () => {
      const events: string[] = [];
      const result = await linearizePrimaryAllocation({
        proposal: primaryProposal(),
        protection: "full",
        isolation: "prefer-primary",
        dependencies: allocationDependencies({
          events,
          readState: async () => {
            events.push("read-state");
            return current;
          },
          apply: async () => {
            current = state({
              kind: "occupied",
              checkoutPath: "/repo",
              recordId: `sha256:${"d".repeat(64)}`,
              leaseState: "live",
            });
            return "allocated";
          },
        }),
      });
      return { result, events };
    };

    const first = await run();
    const second = await run();

    expect(first.result).toEqual({ kind: "allocated", value: "allocated" });
    expect(first.events).toEqual([
      "prepare-remote", "acquire-lock", "read-state", "read-git", "apply-local", "release-lock",
    ]);
    expect(second.result).toEqual({ kind: "refused", reason: "lease-live" });
    expect(second.events.at(-1)).toBe("rollback-remote");
  });
});
