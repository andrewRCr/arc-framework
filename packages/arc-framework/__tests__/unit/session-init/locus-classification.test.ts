import { describe, expect, it } from "vitest";

import {
  locusOwnsBranch,
  locusWorkUnitAtPath,
} from "../../../src/lib/session-init/locus-classification.js";
import type { LocusIdentityV1, LocusRowV1 } from "../../../src/lib/locus/schema/index.js";
import { locusStateFixture, managedWorkUnitRow } from "../../fixtures/locus-state.js";

function identityRow(identity: LocusIdentityV1): LocusRowV1 {
  return {
    kind: "identity-only", checkoutPath: null, primary: null, recordId: null, role: null,
    identity, lease: null, frame: "idle", derived: null, diagnostics: [],
  };
}

const common = {
  claimId: "c".repeat(32),
  protection: "full" as const,
  state: "open" as const,
  savedHead: null,
  changeRequest: null,
};

describe("locus cleanup classification", () => {
  it.each<LocusIdentityV1>([
    {
      ...common, kind: "errand", key: "ordinary", branch: "chore/ordinary", purpose: "errand",
      origin: "description", originEntry: null, dispatchId: null,
    },
    {
      ...common, kind: "errand", key: "routing", branch: "chore/routing", purpose: "housekeep-routing",
      routingLane: "auto", dispatchId: "dispatch-1", routingPlanDigest: `sha256:${"d".repeat(64)}`,
    },
    {
      ...common, kind: "groom", key: "widget", branch: "chore/groom-widget", purpose: null,
      anchorStub: "widget", members: ["widget"], openedBaseHead: "a".repeat(40),
    },
  ])("protects the exact $purpose v3 branch", (identity) => {
    const state = locusStateFixture({ rows: [identityRow(identity)] });
    expect(locusOwnsBranch(state, identity.branch ?? "")).toBe(true);
    expect(locusOwnsBranch(state, `${identity.branch ?? ""}-other`)).toBe(false);
  });

  it("resolves only the exact retained WU role path", () => {
    const state = locusStateFixture({ rows: [managedWorkUnitRow("archived", "/wt/archived")] });
    expect(locusWorkUnitAtPath(state, "/wt/archived")).toEqual({ name: "archived" });
    expect(locusWorkUnitAtPath(state, "/wt/other")).toBeNull();
  });

  it("does not turn stale-record evidence into branch ownership", () => {
    const stale = { ...managedWorkUnitRow("old", "/wt/old"), kind: "stale-record" as const, checkoutPath: null };
    const state = locusStateFixture({ rows: [stale] });
    expect(locusOwnsBranch(state, "feat/old")).toBe(false);
  });
});
