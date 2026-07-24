/** Subject-owned exact locus residue dispatch. */

import { describe, expect, it, vi } from "vitest";

import { createLocusMutationResult } from "../../../src/lib/locus/mutation.js";
import { resolveLocusGeneration } from "../../../src/lib/locus/resolve-driver.js";
import type { LocusRowV1 } from "../../../src/lib/locus/schema/index.js";

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
      leaseId: "3".repeat(32), state: lease, sessionHomePath: "/repo-child",
      attachedAt: "2026-07-20T00:00:00.000Z", heartbeatAt: "2026-07-20T00:00:00.000Z",
    },
    frame: "residue", derived: null, diagnostics: [],
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
        row: row(subject), action, checkoutClean: true, generationProven: true, dependencies: { run },
      });
      expect(run).toHaveBeenCalledWith({
        subject, action, key: "subject",
        selected: { recordId: `sha256:${"1".repeat(64)}`, leaseId: "3".repeat(32) },
      });
      expect(result).toMatchObject({ outcome: "idempotent", operation: "locus-resolve" });
    }
  });

  it.each([
    ["live", "lease-live"], ["unknown", "lease-unknown"],
  ] as const)("refuses %s lease evidence", async (lease, reason) => {
    const result = await resolveLocusGeneration({
      row: row("errand", lease), action: "abandon", checkoutClean: true, generationProven: true,
      dependencies: { run: vi.fn() },
    });
    expect(result).toMatchObject({ outcome: "refused", reason });
  });

  it("refuses dirty, unproven, missing, and changed authority before dispatch", async () => {
    const run = vi.fn();
    expect(await resolveLocusGeneration({
      row: row("groom"), action: "resume", checkoutClean: false, generationProven: true, dependencies: { run },
    })).toMatchObject({ outcome: "refused", reason: "preservation-unproven" });
    expect(await resolveLocusGeneration({
      row: { ...row("groom"), checkoutPath: null }, action: "resume", checkoutClean: true,
      generationProven: true, dependencies: { run },
    })).toMatchObject({ outcome: "refused", reason: "checkout-missing" });
    expect(await resolveLocusGeneration({
      row: { ...row("groom"), lease: null }, action: "resume", checkoutClean: true,
      generationProven: true, dependencies: { run },
    })).toMatchObject({ outcome: "refused", reason: "record-malformed" });
    expect(await resolveLocusGeneration({
      row: row("groom"), action: "resume", checkoutClean: true,
      generationProven: false, dependencies: { run },
    })).toMatchObject({ outcome: "refused", reason: "preservation-unproven" });
    expect(run).not.toHaveBeenCalled();
  });
});
