import { describe, expect, it } from "vitest";

import { deriveLocusSessionGuidance } from "../../../src/lib/locus/session-guidance.js";
import { locusStateFixture, managedWorkUnitRow } from "../../fixtures/locus-state.js";

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
      leaseId: "b".repeat(32), state: "live", sessionHomePath: "/wt/live",
      attachedAt: "2026-07-21T00:00:00.000Z", heartbeatAt: "2026-07-21T00:00:00.000Z",
    };
    const dead = managedWorkUnitRow("dead", "/wt/dead");
    dead.lease = {
      leaseId: "c".repeat(32), state: "dead", sessionHomePath: "/wt/dead",
      attachedAt: "2026-07-20T00:00:00.000Z", heartbeatAt: "2026-07-20T00:00:00.000Z",
    };
    const unknown = managedWorkUnitRow("unknown", "/wt/unknown");
    unknown.lease = {
      leaseId: "d".repeat(32), state: "unknown", sessionHomePath: "/wt/unknown",
      attachedAt: "2026-07-19T00:00:00.000Z", heartbeatAt: "2026-07-19T00:00:00.000Z",
    };

    const result = deriveLocusSessionGuidance({
      ok: true,
      value: locusStateFixture({ rows: [live, dead, unknown] }),
    });

    expect(result).toMatchObject({
      kind: "ready",
      cleanup: [
        "Cleanup for /wt/unknown is manual because lease liveness is unknown.",
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
