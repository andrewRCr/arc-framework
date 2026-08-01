import type { LocusRowV1, LocusStateV1 } from "../../src/lib/locus/schema/index.js";

export function locusStateFixture(options: {
  rows?: LocusRowV1[];
  inFlightIdentities?: LocusStateV1["inFlightIdentities"];
} = {}): LocusStateV1 {
  const rows = options.rows ?? [{
    kind: "free-primary",
    checkoutPath: "/repo",
    primary: true,
    recordId: null,
    role: null,
    identity: null,
    lease: null,
    frame: null,
    derived: null,
    diagnostics: [],
  }];
  return {
    roster: { mode: "locus", ok: true, primaryPath: "/repo", rows, diagnostics: [] },
    current: { kind: "none" },
    primaryAvailability: { kind: "free", checkoutPath: "/repo" },
    inFlightIdentities: options.inFlightIdentities ?? [],
    recovery: { kind: "none" },
    reconciliation: { kind: "clean" },
  };
}

export function managedWorkUnitRow(name: string, checkoutPath: string): LocusRowV1 {
  return {
    kind: "managed-role",
    checkoutPath,
    primary: false,
    recordId: `sha256:${"a".repeat(64)}`,
    role: {
      kind: "work-unit",
      subject: { kind: "work-unit", key: name, claimId: null },
      parentCheckoutPath: null,
      originEntry: null,
    },
    identity: null,
    lease: null,
    frame: "idle",
    derived: null,
    diagnostics: [],
  };
}

