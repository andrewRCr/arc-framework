/**
 * Advertised-base evidence resolution for the session-init husk advisory.
 *
 * The distinction under test is the work unit's central one: an absent fact and an
 * uninspectable prerequisite are not the same answer. Evidence absence resolves to
 * `null`, which the caller reads as "retirement evidence did not revalidate". A
 * failed local availability or history read resolves to neither verdict — it raises,
 * so the `currentHusk` slot reports a typed probe error through its `safeProbe`
 * boundary rather than asserting a checked negative it never checked.
 */

import { describe, expect, it } from "vitest";

import { exactSessionBaseOid } from "../../../src/handlers/status.js";
import type { CleanupBaseEvidence } from "../../../src/lib/session-init/cleanup-remote-evidence.js";

const BASE = "main";
const BASE_OID = "a".repeat(40);

function evidence(overrides: Partial<CleanupBaseEvidence> = {}): CleanupBaseEvidence {
  return {
    remoteSyncEnabled: true,
    snapshot: { kind: "available", scope: "all-heads", tips: { [BASE]: BASE_OID } },
    objectAvailability: { kind: "complete", commits: { [BASE_OID]: true } },
    history: { kind: "complete" },
    ...overrides,
  };
}

const EVIDENCE_ABSENT_CASES: ReadonlyArray<readonly [string, Partial<CleanupBaseEvidence>]> = [
  ["remote sync is disabled", { remoteSyncEnabled: false }],
  ["the remote is unreachable", {
    snapshot: { kind: "unreachable", failureReason: "network" },
  }],
  ["the base is not advertised", {
    snapshot: { kind: "available", scope: "all-heads", tips: { "feat/other": BASE_OID } },
  }],
  ["the base object is pending fetch", {
    objectAvailability: { kind: "complete", commits: { [BASE_OID]: false } },
  }],
  ["local history is shallow", { history: { kind: "shallow" } }],
];

describe("exactSessionBaseOid", () => {
  it("resolves the advertised base OID under complete exact evidence", () => {
    expect(exactSessionBaseOid(evidence(), BASE)).toBe(BASE_OID);
  });

  describe("evidence absence resolves to null", () => {
    it.each(EVIDENCE_ABSENT_CASES)("returns null when %s", (_case, overrides) => {
      expect(exactSessionBaseOid(evidence(overrides), BASE)).toBeNull();
    });
  });

  describe("an uninspectable prerequisite raises rather than fabricating a verdict", () => {
    it("raises when the availability batch could not be inspected", () => {
      // Reachable in production: the remote context degrades availability to
      // `unavailable` when no stdin-capable executor is supplied, while the
      // snapshot still resolves.
      expect(() => exactSessionBaseOid(
        evidence({ objectAvailability: { kind: "unavailable", reason: "execution" } }),
        BASE,
      )).toThrow("Advertised base commit availability could not be inspected.");
    });

    it("raises when the batch returned no fact for the advertised base", () => {
      expect(() => exactSessionBaseOid(
        evidence({ objectAvailability: { kind: "complete", commits: {} } }),
        BASE,
      )).toThrow("The advertised base commit has no local availability fact.");
    });

    it("raises when history completeness could not be inspected", () => {
      expect(() => exactSessionBaseOid(
        evidence({ history: { kind: "unavailable", reason: "execution" } }),
        BASE,
      )).toThrow("Local history completeness could not be inspected.");
    });
  });
});
