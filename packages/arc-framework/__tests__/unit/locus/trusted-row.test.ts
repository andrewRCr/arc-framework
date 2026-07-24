/** Trusted-row authority projection coverage. */

import { describe, expect, it } from "vitest";

import {
  LocusDiagnosticCodeSchema,
  LocusStopReasonSchema,
  type LocusDiagnosticV1,
  type LocusRowV1,
} from "../../../src/lib/locus/schema/index.js";
import { projectTrustedLocusRow, trustedLocusRows } from "../../../src/lib/locus/trusted-row.js";

const RECORD_ID = `sha256:${"a".repeat(64)}`;

function diagnostic(code: LocusDiagnosticV1["code"]): LocusDiagnosticV1 {
  return { code, source: { kind: "record", key: "record-a" }, message: code };
}

function row(overrides: Partial<LocusRowV1> = {}): LocusRowV1 {
  return {
    kind: "managed-role",
    checkoutPath: "/repo/wu",
    primary: false,
    recordId: RECORD_ID,
    role: {
      kind: "work-unit",
      subject: { kind: "work-unit", key: "some-wu", claimId: null },
      parentCheckoutPath: null,
      originEntry: null,
    },
    identity: null,
    lease: null,
    frame: "idle",
    derived: null,
    diagnostics: [],
    ...overrides,
  };
}

describe("projectTrustedLocusRow", () => {
  it("trusts a managed role whose coordinates and authority are established", () => {
    const subject = row();
    const result = projectTrustedLocusRow(subject);

    expect(result.kind).toBe("trusted");
    if (result.kind !== "trusted") return;
    expect(result.value.recordId).toBe(RECORD_ID);
    expect(result.value.checkoutPath).toBe("/repo/wu");
    expect(result.value.role.subject.key).toBe("some-wu");
    expect(result.value.row).toBe(subject);
  });

  describe("authority-fatal diagnostics", () => {
    const fatal = ["subject-unresolved", "cross-identity", "marker-missing", "record-malformed",
      "unsupported-version", "duplicate-locus", "identity-malformed", "path-unavailable"] as const;

    it.each(fatal)("refuses a managed role carrying %s", (code) => {
      const result = projectTrustedLocusRow(row({ diagnostics: [diagnostic(code)] }));

      expect(result).toEqual({ kind: "untrusted", reasons: [code] });
    });
  });

  describe("unverifiable liveness", () => {
    // `attachLocusLease` already refuses an unknown observed liveness before replacing a lease.
    // Treating it as fatal here makes the same refusal reachable from every consumer, including
    // the idempotent-open selectors that perform no liveness check of their own.
    it.each(["lease-unknown", "lock-unknown"] as const)("refuses a managed role carrying %s", (code) => {
      const result = projectTrustedLocusRow(row({ diagnostics: [diagnostic(code)] }));

      expect(result).toEqual({ kind: "untrusted", reasons: [code] });
    });
  });

  describe("state diagnostics leave authority intact", () => {
    const stateOnly = ["lease-dead", "lock-dead", "lock-without-record",
      "worktree-without-role", "record-without-checkout"] as const;

    it.each(stateOnly)("still trusts a managed role carrying %s", (code) => {
      expect(projectTrustedLocusRow(row({ diagnostics: [diagnostic(code)] })).kind).toBe("trusted");
    });

    it("trusts a dead lease so replacement can act on it", () => {
      const subject = row({
        lease: {
          leaseId: "b".repeat(32),
          state: "dead",
          sessionHomePath: "/repo/wu",
          attachedAt: "2026-07-24T00:00:00.000Z",
          heartbeatAt: "2026-07-24T00:00:00.000Z",
        },
        diagnostics: [diagnostic("lease-dead")],
      });

      expect(projectTrustedLocusRow(subject).kind).toBe("trusted");
    });
  });

  it("derives the fatal set from the published enums rather than a restated list", () => {
    for (const code of LocusDiagnosticCodeSchema.options) {
      const alsoAStopReason = (LocusStopReasonSchema.options as readonly string[]).includes(code);
      const result = projectTrustedLocusRow(row({ diagnostics: [diagnostic(code)] }));

      expect(result.kind, `diagnostic ${code}`).toBe(alsoAStopReason ? "untrusted" : "trusted");
    }
  });

  describe("row kinds other than managed-role", () => {
    const mapped = [
      ["stale-record", "record-malformed"],
      ["malformed-record", "record-malformed"],
      ["duplicate-locus", "duplicate-locus"],
      ["free-primary", "role-conflict"],
      ["unmanaged-checkout", "role-conflict"],
    ] as const;

    it.each(mapped)("refuses a %s row as %s", (kind, reason) => {
      const result = projectTrustedLocusRow(row({ kind }));

      expect(result).toEqual({ kind: "untrusted", reasons: [reason] });
    });

    it("refuses a stale record that carries an otherwise complete role and lease", () => {
      const subject = row({
        kind: "stale-record",
        lease: {
          leaseId: "b".repeat(32),
          state: "unknown",
          sessionHomePath: "/repo/wu",
          attachedAt: "2026-07-24T00:00:00.000Z",
          heartbeatAt: "2026-07-24T00:00:00.000Z",
        },
      });

      expect(projectTrustedLocusRow(subject)).toEqual({
        kind: "untrusted",
        reasons: ["record-malformed"],
      });
    });
  });

  describe("missing coordinates", () => {
    it.each([
      ["recordId", { recordId: null }],
      ["checkoutPath", { checkoutPath: null }],
      ["role", { role: null }],
    ] as const)("refuses a managed role with no %s", (_name, override) => {
      const result = projectTrustedLocusRow(row(override));

      expect(result).toEqual({ kind: "untrusted", reasons: ["record-malformed"] });
    });

    it("refuses an identity-only row for both its kind and its absent coordinates", () => {
      const result = projectTrustedLocusRow(row({
        kind: "identity-only",
        checkoutPath: null,
        recordId: null,
        role: null,
      }));

      expect(result).toEqual({ kind: "untrusted", reasons: ["role-conflict", "record-malformed"] });
    });
  });

  it("accumulates every reason, deduplicated and in published-enum order", () => {
    const result = projectTrustedLocusRow(row({
      kind: "duplicate-locus",
      diagnostics: [
        diagnostic("subject-unresolved"),
        diagnostic("cross-identity"),
        diagnostic("subject-unresolved"),
        diagnostic("lease-dead"),
        diagnostic("duplicate-locus"),
      ],
    }));

    expect(result).toEqual({
      kind: "untrusted",
      reasons: ["duplicate-locus", "cross-identity", "subject-unresolved"],
    });
  });

  it("reports reasons in a stable order regardless of diagnostic order", () => {
    const codes = ["cross-identity", "subject-unresolved", "marker-missing"] as const;
    const forward = projectTrustedLocusRow(row({ diagnostics: codes.map(diagnostic) }));
    const reverse = projectTrustedLocusRow(row({ diagnostics: [...codes].reverse().map(diagnostic) }));

    expect(forward).toEqual(reverse);
  });
});

describe("trustedLocusRows", () => {
  it("keeps trusted rows in reader order and drops the rest", () => {
    const first = row({ checkoutPath: "/repo/a" });
    const untrusted = row({ checkoutPath: "/repo/b", diagnostics: [diagnostic("marker-missing")] });
    const second = row({ checkoutPath: "/repo/c" });

    expect(trustedLocusRows([first, untrusted, second]).map((entry) => entry.checkoutPath))
      .toEqual(["/repo/a", "/repo/c"]);
  });

  it("returns nothing when no row carries established authority", () => {
    expect(trustedLocusRows([row({ kind: "free-primary" }), row({ recordId: null })])).toEqual([]);
  });
});
