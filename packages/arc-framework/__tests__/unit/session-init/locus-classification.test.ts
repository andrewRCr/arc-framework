import { describe, expect, it } from "vitest";

import {
  locusOccupancyAtPath,
  locusOwnsBranch,
  locusWorkUnitAtPath,
} from "../../../src/lib/session-init/locus-classification.js";
import type {
  LocusDiagnosticV1,
  LocusIdentityV1,
  LocusRowV1,
} from "../../../src/lib/locus/schema/index.js";
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
      origin: "description", originEntry: null,
    },
    {
      ...common, kind: "errand", key: "routing", branch: "chore/routing", purpose: "housekeep-routing",
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

function lease(state: "live" | "dead" | "unknown"): NonNullable<LocusRowV1["lease"]> {
  return {
    leaseId: "l".repeat(32),
    state,
    sessionHomePath: "/wt/archived",
    attachedAt: "2026-07-24T00:00:00.000Z",
    heartbeatAt: "2026-07-24T00:00:00.000Z",
  };
}

function diagnostic(code: LocusDiagnosticV1["code"]): LocusDiagnosticV1 {
  return { code, source: { kind: "checkout", key: "/wt/archived" }, message: code };
}

function unmanagedRow(checkoutPath: string, diagnostics: LocusDiagnosticV1[] = []): LocusRowV1 {
  return {
    kind: "unmanaged-checkout", checkoutPath, primary: false, recordId: null, role: null,
    identity: null, lease: null, frame: null, derived: null, diagnostics,
  };
}

describe("locusOccupancyAtPath", () => {
  it("is clear when no record claims the checkout", () => {
    const state = locusStateFixture({ rows: [unmanagedRow("/wt/archived")] });
    expect(locusOccupancyAtPath(state, "/wt/archived")).toBe("clear");
    expect(locusOccupancyAtPath(state, "/wt/unlisted")).toBe("clear");
  });

  it("is clear for a trusted role whose lease is absent or dead", () => {
    const retained = managedWorkUnitRow("archived", "/wt/archived");
    expect(locusOccupancyAtPath(locusStateFixture({ rows: [retained] }), "/wt/archived")).toBe("clear");

    const dead = { ...retained, lease: lease("dead"), diagnostics: [diagnostic("lease-dead")] };
    expect(locusOccupancyAtPath(locusStateFixture({ rows: [dead] }), "/wt/archived")).toBe("clear");
  });

  it("suppresses a checkout a live lease occupies", () => {
    const occupied = { ...managedWorkUnitRow("archived", "/wt/archived"), lease: lease("live") };
    expect(locusOccupancyAtPath(locusStateFixture({ rows: [occupied] }), "/wt/archived")).toBe("suppress");
  });

  it("stays manual when the lease exists but its liveness is unverifiable", () => {
    const unknown = { ...managedWorkUnitRow("archived", "/wt/archived"), lease: lease("unknown") };
    expect(locusOccupancyAtPath(locusStateFixture({ rows: [unknown] }), "/wt/archived")).toBe("manual");
  });

  it.each<LocusDiagnosticV1["code"]>([
    "record-malformed", "cross-identity", "marker-missing", "subject-unresolved", "unsupported-version",
  ])("stays manual when the claiming row carries %s", (code) => {
    const untrusted = { ...managedWorkUnitRow("archived", "/wt/archived"), diagnostics: [diagnostic(code)] };
    expect(locusOccupancyAtPath(locusStateFixture({ rows: [untrusted] }), "/wt/archived")).toBe("manual");
  });

  it.each<LocusRowV1["kind"]>(["stale-record", "malformed-record", "duplicate-locus"])(
    "stays manual for a %s row claiming the checkout",
    (kind) => {
      const row = { ...managedWorkUnitRow("archived", "/wt/archived"), kind };
      expect(locusOccupancyAtPath(locusStateFixture({ rows: [row] }), "/wt/archived")).toBe("manual");
    },
  );

  it("stays manual when more than one record claims the checkout", () => {
    const rows = [
      managedWorkUnitRow("archived", "/wt/archived"),
      managedWorkUnitRow("other", "/wt/archived"),
    ];
    expect(locusOccupancyAtPath(locusStateFixture({ rows }), "/wt/archived")).toBe("manual");
  });

  it("stays manual when the checkout path could not be resolved", () => {
    const rows = [unmanagedRow("/wt/archived", [diagnostic("path-unavailable")])];
    expect(locusOccupancyAtPath(locusStateFixture({ rows }), "/wt/archived")).toBe("manual");
  });
});
