/** Subject-owned exact locus residue dispatch. */

import { describe, expect, it, vi } from "vitest";

import { createLocusMutationResult } from "../../../src/lib/locus/mutation.js";
import { resolveLocusGeneration } from "../../../src/lib/locus/resolve-driver.js";
import type { LocusDiagnosticV1, LocusRowV1 } from "../../../src/lib/locus/schema/index.js";

function diagnostic(code: LocusDiagnosticV1["code"]): LocusDiagnosticV1 {
  return { code, source: { kind: "record", key: "locus-record.json" }, message: `Record is ${code}` };
}

/** A dead-leased residue row carrying the named authority evidence alongside its own `lease-dead`. */
function publishedResidue(...codes: LocusDiagnosticV1["code"][]): LocusRowV1 {
  const base = row("errand");
  return { ...base, diagnostics: [...base.diagnostics, ...codes.map(diagnostic)] };
}

/**
 * The diagnostics the reader attaches to a row for a given lease state.
 *
 * Liveness evidence is not optional decoration: the reader emits `lease-dead` for every dead lease
 * and `lease-unknown` for every unverifiable one. A row built without them is a shape production
 * never sees, so any gate tested against it is tested against a fiction.
 */
function leaseDiagnostics(lease: "dead" | "live" | "unknown"): LocusDiagnosticV1[] {
  return lease === "live" ? [] : [diagnostic(lease === "dead" ? "lease-dead" : "lease-unknown")];
}

function row(kind: "errand" | "housekeep" | "groom", lease: "dead" | "live" | "unknown" = "dead"): LocusRowV1 {
  const subjectKind = kind === "errand" ? "errand" : kind;
  return {
    kind: "managed-role", checkoutPath: "/repo-child", primary: false, recordId: `sha256:${"1".repeat(64)}`,
    role: {
      kind, subject: { kind: subjectKind, key: "subject", claimId: "2".repeat(32) }, parentCheckoutPath: "/repo-wu",
      originEntry: null,
    },
    identity: null,
    lease: {
      leaseId: "3".repeat(32), selfHeld: false, state: lease, sessionHomePath: "/repo-child",
      attachedAt: "2026-07-20T00:00:00.000Z", heartbeatAt: "2026-07-20T00:00:00.000Z",
    },
    frame: "residue", derived: null, diagnostics: leaseDiagnostics(lease),
  };
}

describe("locus resolve driver", () => {
  it.each(["errand", "housekeep", "groom"] as const)("dispatches %s resume and abandon", async (subject) => {
    for (const action of ["resume", "abandon"] as const) {
      const run = vi.fn(async () => createLocusMutationResult({
        outcome: "idempotent", operation: subject === "errand" ? "errand-abandon"
          : subject === "housekeep" ? "housekeep-abandon" : "plan-abandon",
        allocation: null, recordId: null, leaseId: null, activeLocusPath: null, sessionHomePath: null,
        identity: null, originEntry: null,
        restoredParent: null, nextOffer: null, recommendedPromptText: "Delegated.",
      }));
      const result = await resolveLocusGeneration({
        row: row(subject), action, checkoutClean: true, confirmedNoLiveSession: false, dependencies: { run },
      });
      expect(run).toHaveBeenCalledWith({
        subject, action, key: "subject",
        selected: { recordId: `sha256:${"1".repeat(64)}`, leaseId: "3".repeat(32) },
        confirmedNoLiveSession: false,
      });
      expect(result).toMatchObject({ outcome: "idempotent", operation: "locus-resolve" });
    }
  });

  it("abandons a residue row carrying the diagnostics that define it", async () => {
    const run = vi.fn(async () => createLocusMutationResult({
      outcome: "applied", operation: "errand-abandon",
      allocation: null, recordId: null, leaseId: null, activeLocusPath: null, sessionHomePath: null,
      identity: null, originEntry: null,
      restoredParent: null, nextOffer: null, recommendedPromptText: "Released.",
    }));
    const result = await resolveLocusGeneration({
      row: publishedResidue("subject-unresolved"), action: "abandon", checkoutClean: true, confirmedNoLiveSession: false,
      dependencies: { run },
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ outcome: "applied", operation: "locus-resolve" });
  });

  it.each([
    ["live", "lease-live"], ["unknown", "lease-unknown"],
  ] as const)("refuses %s lease evidence", async (lease, reason) => {
    const result = await resolveLocusGeneration({
      row: row("errand", lease), action: "abandon", checkoutClean: true, confirmedNoLiveSession: false,
      dependencies: { run: vi.fn() },
    });
    expect(result).toMatchObject({ outcome: "refused", reason });
  });

  it("refuses dirty, missing, and changed authority before dispatch", async () => {
    const run = vi.fn();
    expect(await resolveLocusGeneration({
      row: row("groom"), action: "resume", checkoutClean: false, confirmedNoLiveSession: false, dependencies: { run },
    })).toMatchObject({ outcome: "refused", reason: "preservation-unproven" });
    expect(await resolveLocusGeneration({
      row: { ...row("groom"), checkoutPath: null }, action: "resume", checkoutClean: true, confirmedNoLiveSession: false,
      dependencies: { run },
    })).toMatchObject({ outcome: "refused", reason: "checkout-missing" });
    expect(await resolveLocusGeneration({
      row: { ...row("groom"), lease: null }, action: "resume", checkoutClean: true, confirmedNoLiveSession: false,
      dependencies: { run },
    })).toMatchObject({ outcome: "refused", reason: "record-malformed" });
    expect(await resolveLocusGeneration({
      row: { ...row("groom"), frame: "idle" }, action: "resume", checkoutClean: true, confirmedNoLiveSession: false,
      dependencies: { run },
    })).toMatchObject({ outcome: "refused", reason: "role-conflict" });
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses resume on the unresolved subject abandon tolerates", async () => {
    const run = vi.fn();
    const result = await resolveLocusGeneration({
      row: publishedResidue("subject-unresolved"), action: "resume", checkoutClean: true, confirmedNoLiveSession: false,
      dependencies: { run },
    });
    expect(result).toMatchObject({ outcome: "refused", reason: "role-conflict" });
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    ["cross-identity", "role-conflict"],
    ["marker-missing", "role-conflict"],
    ["identity-malformed", "record-malformed"],
    ["unsupported-version", "record-malformed"],
    ["path-unavailable", "role-conflict"],
  ] as const)("refuses abandon on %s authority evidence", async (code, reason) => {
    const run = vi.fn();
    const result = await resolveLocusGeneration({
      row: publishedResidue("subject-unresolved", code), action: "abandon", checkoutClean: true, confirmedNoLiveSession: false,
      dependencies: { run },
    });
    expect(result).toMatchObject({ outcome: "refused", reason });
    expect(run).not.toHaveBeenCalled();
  });
});

describe("operator attestation over a lease no inspector can retire", () => {
  function selfHeld(lease: "live" | "unknown", ...codes: LocusDiagnosticV1["code"][]): LocusRowV1 {
    const base = row("errand", lease);
    return {
      ...base,
      lease: { ...base.lease as NonNullable<LocusRowV1["lease"]>, selfHeld: true },
      diagnostics: [...base.diagnostics, ...codes.map(diagnostic)],
    };
  }

  it("refuses a verifiably foreign live lease however loudly it is confirmed", async () => {
    const run = vi.fn();
    const result = await resolveLocusGeneration({
      row: row("errand", "live"), action: "abandon", checkoutClean: true,
      confirmedNoLiveSession: true, dependencies: { run },
    });
    expect(result).toMatchObject({ outcome: "refused", reason: "lease-live" });
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses a self-held lease until the attestation is given", async () => {
    const run = vi.fn();
    const result = await resolveLocusGeneration({
      row: selfHeld("live", "subject-unresolved"), action: "abandon", checkoutClean: true,
      confirmedNoLiveSession: false, dependencies: { run },
    });
    expect(result).toMatchObject({ outcome: "refused", reason: "lease-live" });
    expect(result.recommendedPromptText).toContain("exit this process");
    expect(run).not.toHaveBeenCalled();
  });

  it("clears the recorded stranding case once attested", async () => {
    const run = vi.fn(async () => createLocusMutationResult({
      outcome: "applied", operation: "errand-abandon",
      allocation: null, recordId: null, leaseId: null, activeLocusPath: null, sessionHomePath: null,
      identity: null, originEntry: null, restoredParent: null, nextOffer: null,
      recommendedPromptText: "Abandoned.",
    }));
    const result = await resolveLocusGeneration({
      row: selfHeld("live", "subject-unresolved"), action: "abandon", checkoutClean: true,
      confirmedNoLiveSession: true, dependencies: { run },
    });
    expect(result).toMatchObject({ outcome: "applied" });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      subject: "errand", action: "abandon", confirmedNoLiveSession: true,
    }));
  });

  it("clears an unverifiable lease that is not this process's own", async () => {
    const run = vi.fn(async () => createLocusMutationResult({
      outcome: "applied", operation: "errand-abandon",
      allocation: null, recordId: null, leaseId: null, activeLocusPath: null, sessionHomePath: null,
      identity: null, originEntry: null, restoredParent: null, nextOffer: null,
      recommendedPromptText: "Abandoned.",
    }));
    expect(await resolveLocusGeneration({
      row: row("errand", "unknown"), action: "abandon", checkoutClean: true,
      confirmedNoLiveSession: true, dependencies: { run },
    })).toMatchObject({ outcome: "applied" });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ confirmedNoLiveSession: true }));
  });

  it("never lets the attestation stand in for the other guards", async () => {
    const run = vi.fn();
    // Dirty checkout: preservation is unproven whatever the operator attests about liveness.
    expect(await resolveLocusGeneration({
      row: selfHeld("live", "subject-unresolved"), action: "abandon", checkoutClean: false,
      confirmedNoLiveSession: true, dependencies: { run },
    })).toMatchObject({ outcome: "refused", reason: "preservation-unproven" });
    // Foreign identity evidence stays fatal to the dispatch it would authorize.
    expect(await resolveLocusGeneration({
      row: selfHeld("live", "cross-identity"), action: "abandon", checkoutClean: true,
      confirmedNoLiveSession: true, dependencies: { run },
    })).toMatchObject({ outcome: "refused", reason: "role-conflict" });
    expect(run).not.toHaveBeenCalled();
  });
});
