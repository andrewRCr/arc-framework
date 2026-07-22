import { describe, expect, it } from "vitest";

import { deriveLocusSessionGuidance } from "../../../src/lib/locus/session-guidance.js";
import { locusStateFixture, managedWorkUnitRow } from "../../fixtures/locus-state.js";

describe("deriveLocusSessionGuidance", () => {
  it("renders lease-aware cleanup without treating a dead lease as deletion authority", () => {
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

    const result = deriveLocusSessionGuidance({
      ok: true,
      value: locusStateFixture({ rows: [live, dead] }),
    });

    expect(result).toMatchObject({
      kind: "ready",
      cleanup: [
        "Keep /wt/live: a live session lease occupies this locus.",
        expect.stringContaining("lease state alone never authorizes removal"),
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/age|stale/i);
  });

  it("renders fixed identity actions and reader diagnostics in supplied order", () => {
    const state = locusStateFixture();
    state.inFlightIdentities = [{
      identity: {
        kind: "errand", key: "review", claimId: "c".repeat(32), protection: "full",
        branch: "chore/review", purpose: "errand", origin: "description", originEntry: null,
        dispatchId: null, state: "awaiting-merge", savedHead: null,
        changeRequest: {
          repositoryRef: "owner/repo", hostRef: "github", baseRef: "main", headRef: "chore/review",
          headSha: "a".repeat(40),
        },
      },
      actions: ["resume", "wait", "finalize", "abandon"],
    }];
    state.roster.diagnostics.push({
      code: "marker-missing", source: { kind: "checkout", key: "/wt/review" }, message: "marker absent",
    });

    const result = deriveLocusSessionGuidance({ ok: true, value: state });
    expect(result).toMatchObject({
      kind: "ready",
      identities: ["errand 'review' is awaiting-merge; available actions: resume → wait → finalize → abandon."],
      diagnostics: ["marker-missing at checkout '/wt/review': marker absent"],
    });
  });

  it("precomposes root failures without reconstructing partial state", () => {
    expect(deriveLocusSessionGuidance({
      ok: false,
      error: { kind: "runtime", message: "identity tree unavailable" },
    })).toEqual({
      kind: "unavailable",
      message: "Locus state is unavailable (runtime): identity tree unavailable",
    });
  });
});
