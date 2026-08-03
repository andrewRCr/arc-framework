import { describe, expect, it } from "vitest";

import { deriveLocusSessionGuidance } from "../../../src/lib/locus/session-guidance.js";
import { locusStateFixture, managedWorkUnitRow } from "../../fixtures/locus-state.js";
import type { LocusRowV1 } from "../../../src/lib/locus/schema/index.js";

describe("deriveLocusSessionGuidance", () => {
  it("suppresses expected leaseless WU checkout narration", () => {
    const idle = managedWorkUnitRow("demo", "/wt/demo");
    const result = deriveLocusSessionGuidance({
      ok: true,
      value: locusStateFixture({ rows: [idle] }),
    });

    expect(result).toEqual({
      kind: "ready",
      identities: [],
      cleanup: [],
      diagnostics: [],
    });
  });

  it("renders only lease state that requires manual action", () => {
    const live = managedWorkUnitRow("live", "/wt/live");
    live.lease = {
      leaseId: "b".repeat(32), selfHeld: false, state: "live", sessionHomePath: "/wt/live",
      attachedAt: "2026-07-21T00:00:00.000Z", heartbeatAt: "2026-07-21T00:00:00.000Z",
    };
    const dead = managedWorkUnitRow("dead", "/wt/dead");
    dead.lease = {
      leaseId: "c".repeat(32), selfHeld: false, state: "dead", sessionHomePath: "/wt/dead",
      attachedAt: "2026-07-20T00:00:00.000Z", heartbeatAt: "2026-07-20T00:00:00.000Z",
    };
    const unknown = managedWorkUnitRow("unknown", "/wt/unknown");
    unknown.lease = {
      leaseId: "d".repeat(32), selfHeld: false, state: "unknown", sessionHomePath: "/wt/unknown",
      attachedAt: "2026-07-19T00:00:00.000Z", heartbeatAt: "2026-07-19T00:00:00.000Z",
    };

    const result = deriveLocusSessionGuidance({
      ok: true,
      value: locusStateFixture({ rows: [live, dead, unknown] }),
    });

    expect(result).toMatchObject({
      kind: "ready",
      cleanup: [
        "Cleanup for /wt/unknown is manual because lease liveness is unknown; "
          + "resolve it with `--confirm-no-live-session` once no live session holds it.",
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/\/wt\/(live|dead)/u);
  });

  it("renders fixed identity actions and only actionable reader diagnostics in supplied order", () => {
    const state = locusStateFixture();
    state.roster.rows.push({
      kind: "unmanaged-checkout",
      checkoutPath: "/wt/sibling",
      primary: false,
      recordId: null,
      role: null,
      identity: null,
      lease: null,
      frame: null,
      derived: null,
      diagnostics: [],
    });
    state.inFlightIdentities = [{
      identity: {
        kind: "errand", key: "review", claimId: "c".repeat(32), protection: "full",
        branch: "chore/review", purpose: "errand", origin: "description", originEntry: null,
        state: "awaiting-merge", savedHead: null,
        changeRequest: {
          repositoryRef: "owner/repo", hostRef: "github", baseRef: "main", headRef: "chore/review",
          headSha: "a".repeat(40),
        },
      },
      actions: ["resume", "wait", "finalize", "abandon"],
    }];
    state.roster.diagnostics.push({
      code: "worktree-without-role", source: { kind: "checkout", key: "/wt/sibling" }, message: "role absent",
    }, {
      code: "marker-missing", source: { kind: "checkout", key: "/wt/review" }, message: "marker absent",
    });

    const result = deriveLocusSessionGuidance({ ok: true, value: state });
    expect(result).toMatchObject({
      kind: "ready",
      identities: ["errand 'review' is awaiting-merge; available actions: resume → wait → finalize → abandon."],
      cleanup: [],
      diagnostics: ["marker-missing at checkout '/wt/review': marker absent"],
    });
  });

  it("keeps current-frame narration only when it directs reconciliation", () => {
    const state = locusStateFixture();
    state.current = {
      kind: "ambiguous",
      recordIds: [`sha256:${"a".repeat(64)}`, `sha256:${"b".repeat(64)}`],
      reasons: ["role-conflict"],
    };

    expect(deriveLocusSessionGuidance({ ok: true, value: state })).toMatchObject({
      kind: "ready",
      currentFrame: "Active session locus is ambiguous (role-conflict); reconcile before continuing.",
    });
  });

  it("suppresses a resolved frame while retaining its recovery action", () => {
    const active = managedWorkUnitRow("active", "/wt/active");
    const state = locusStateFixture({ rows: [active] });
    state.current = {
      kind: "resolved",
      sessionHomeRecordId: active.recordId,
      activeRecordId: active.recordId ?? "",
      parentRecordId: null,
    };
    state.recovery = {
      kind: "resume",
      activeRecordId: active.recordId ?? "",
      parentRecordId: null,
    };

    const result = deriveLocusSessionGuidance({ ok: true, value: state });
    expect(result).not.toHaveProperty("currentFrame");
    expect(result).toMatchObject({ recovery: expect.stringContaining("Resume session locus record") });
  });

  it("precomposes root failures without reconstructing partial state", () => {
    expect(deriveLocusSessionGuidance({
      ok: false,
      error: { kind: "runtime", message: "identity tree unavailable" },
    })).toEqual({
      kind: "unavailable",
      message: "Session locus state is unavailable (runtime): identity tree unavailable",
    });
  });
});
describe("advisory suppression and reachable residue exits", () => {
  const RECORD = `sha256:${"a".repeat(64)}`;

  /** Narrow to the composed variant; an `unavailable` result here is a fixture bug, not a case. */
  function ready(result: ReturnType<typeof deriveLocusSessionGuidance>) {
    if (result.kind !== "ready") throw new Error(`expected ready guidance, got ${result.kind}`);
    return result;
  }

  function withPrimary(reasons: ("primary-dirty" | "primary-off-base" | "lock-live")[]) {
    return ready(deriveLocusSessionGuidance({
      ok: true,
      value: {
        ...locusStateFixture({}),
        primaryAvailability: { kind: "unsafe", checkoutPath: "/repo", reasons },
      },
    }));
  }

  function withResidue(lease: LocusRowV1["lease"]) {
    const row = { ...managedWorkUnitRow("demo", "/wt/demo"), lease };
    return ready(deriveLocusSessionGuidance({
      ok: true,
      value: {
        ...locusStateFixture({ rows: [row] }),
        recovery: { kind: "residue", recordId: RECORD, actions: ["resume", "abandon"] },
      },
    }));
  }

  function lease(state: "live" | "unknown" | "dead", selfHeld: boolean): LocusRowV1["lease"] {
    return {
      leaseId: "b".repeat(32), state, selfHeld, sessionHomePath: "/wt/demo",
      attachedAt: "2026-07-24T00:00:00.000Z", heartbeatAt: "2026-07-24T00:00:00.000Z",
    };
  }

  it("says nothing about a primary that is only dirty or off base", () => {
    expect(withPrimary(["primary-dirty", "primary-off-base"]).primaryAvailability).toBeUndefined();
  });

  it("still speaks when a reason costs more than an allocation precondition", () => {
    expect(withPrimary(["primary-off-base", "lock-live"]).primaryAvailability)
      .toContain("unsafe (primary-off-base, lock-live)");
  });

  it("tells the holder of a self-held lease how it actually ends", () => {
    const text = withResidue(lease("live", true)).recovery ?? "";
    expect(text).toContain("This lease is yours");
    expect(text).toContain("dies when the process exits");
    expect(text).toContain("--confirm-no-live-session");
  });

  it("names the exit from the surface that reports an unverifiable lease", () => {
    expect(withResidue(lease("unknown", false)).recovery).toContain("--confirm-no-live-session");
    expect(withResidue(lease("unknown", false)).cleanup.join(" ")).toContain("--confirm-no-live-session");
  });

  it("leaves an ordinary dead-lease residue offer unchanged", () => {
    const text = withResidue(lease("dead", false)).recovery ?? "";
    expect(text).toBe(`Session locus residue ${RECORD} offers: resume → abandon.`);
  });
});
