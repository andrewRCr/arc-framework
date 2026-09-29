import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import {
  CanonicalDigestSchema,
  PrioritySchema,
  RemoteEvidenceSchema,
  RemoteFailureReasonSchema,
  WORK_UNIT_STATE_ORDER,
  WorkClassSchema,
  WorkUnitStateSchema,
  validateClass,
  validatePriority,
  validateState,
  withRemoteEvidence,
  isCanonicalDigest,
  type CanonicalDigest,
  type Priority,
  type RemoteEvidence,
  type RemoteFailureReason,
  type WorkClass,
  type WorkUnitState,
} from "../../../src/lib/kernel/index.js";
import {
  PrioritySchema as OldPrioritySchema,
  WORK_UNIT_STATE_ORDER as OLD_WORK_UNIT_STATE_ORDER,
  WorkClassSchema as OldWorkClassSchema,
  WorkUnitStateSchema as OldWorkUnitStateSchema,
  validateClass as oldValidateClass,
  validatePriority as oldValidatePriority,
  validateState as oldValidateState,
  type Priority as OldPriority,
  type WorkClass as OldWorkClass,
  type WorkUnitState as OldWorkUnitState,
} from "../../../src/commands/active/types.js";

describe("kernel work-unit vocabulary", () => {
  it("parses and types a canonical digest", () => {
    const digest = `sha256:${"a".repeat(64)}`;

    expect(CanonicalDigestSchema.parse(digest)).toBe(digest);
    expectTypeOf(CanonicalDigestSchema.parse(digest)).toEqualTypeOf<CanonicalDigest>();
  });

  it.each([
    ["uppercase hex", `sha256:${"A".repeat(64)}`],
    ["wrong length", `sha256:${"a".repeat(63)}`],
    ["missing prefix", "a".repeat(64)],
  ])("refuses a digest with %s using an actionable message", (_case, candidate) => {
    const result = CanonicalDigestSchema.safeParse(candidate);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Expected sha256: followed by 64 lowercase hex characters");
    }
  });

  it("projects the canonical digest wire pattern into JSON Schema", () => {
    const schema = z.toJSONSchema(CanonicalDigestSchema);

    expect(schema.type).toBe("string");
    expect(schema.pattern).toBe("^sha256:[0-9a-f]{64}$");
  });

  it("agrees with the canonical digest guard on accepted and rejected values", () => {
    for (const value of [
      `sha256:${"a".repeat(64)}`,
      `sha256:${"A".repeat(64)}`,
      `sha256:${"a".repeat(63)}`,
      "a".repeat(64),
    ]) {
      expect(CanonicalDigestSchema.safeParse(value).success).toBe(isCanonicalDigest(value));
    }
  });

  it("parses only the codified remote evidence and failure values", () => {
    for (const value of ["exact", "pending-fetch", "unreachable", "not-applicable"] as const) {
      expect(RemoteEvidenceSchema.parse(value)).toBe(value);
      expectTypeOf(RemoteEvidenceSchema.parse(value)).toEqualTypeOf<RemoteEvidence>();
    }
    for (const invalid of ["pending", "offline", "unknown", "", null]) {
      expect(RemoteEvidenceSchema.safeParse(invalid).success).toBe(false);
    }

    for (const value of ["timeout", "network", "auth", "error"] as const) {
      expect(RemoteFailureReasonSchema.parse(value)).toBe(value);
      expectTypeOf(RemoteFailureReasonSchema.parse(value)).toEqualTypeOf<RemoteFailureReason>();
    }
    for (const invalid of ["permission", "malformed", "offline", "", null]) {
      expect(RemoteFailureReasonSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("composes strict domain schemas with evidence-dependent failure reasons", () => {
    const schema = withRemoteEvidence({ state: z.enum(["ready", "blocked"]) });

    expect(schema.parse({ state: "ready", remoteEvidence: "exact" })).toEqual({
      state: "ready",
      remoteEvidence: "exact",
    });
    expect(schema.parse({
      state: "blocked",
      remoteEvidence: "unreachable",
      failureReason: "network",
    })).toEqual({
      state: "blocked",
      remoteEvidence: "unreachable",
      failureReason: "network",
    });

    expect(schema.safeParse({ state: "blocked", remoteEvidence: "unreachable" }).success).toBe(false);
    for (const remoteEvidence of ["exact", "pending-fetch", "not-applicable"] as const) {
      expect(schema.safeParse({ state: "blocked", remoteEvidence, failureReason: "timeout" }).success).toBe(false);
      expect(schema.safeParse({ state: "blocked", remoteEvidence, failureReason: undefined }).success).toBe(false);
    }
    expect(schema.safeParse({ state: "ready", remoteEvidence: "exact", extra: true }).success).toBe(false);
    expect(schema.safeParse({ remoteEvidence: "exact" }).success).toBe(false);
  });

  it("parses only the codified lifecycle states and preserves their order", () => {
    const states = ["Planning", "Active", "Integrating", "Shipped"] as const;
    for (const state of states) {
      expect(WorkUnitStateSchema.parse(state)).toBe(state);
      expectTypeOf(WorkUnitStateSchema.parse(state)).toEqualTypeOf<WorkUnitState>();
    }
    for (const invalid of ["In Progress", "Paused", "Complete", "Superseded", "active", "", " ", null]) {
      expect(WorkUnitStateSchema.safeParse(invalid).success).toBe(false);
      expect(validateState(invalid)).toBe("unknown");
    }
    expect(WORK_UNIT_STATE_ORDER).toEqual({ Planning: 0, Active: 1, Integrating: 2, Shipped: 3 });
  });

  it("keeps Class parsing strict and its display narrower normalized", () => {
    for (const value of ["Light", "Heavy", "Novel"] as const) {
      expect(WorkClassSchema.parse(value)).toBe(value);
      expectTypeOf(WorkClassSchema.parse(value)).toEqualTypeOf<WorkClass>();
    }
    for (const invalid of ["light", "HEAVY", "[TBD]", "", null]) {
      expect(WorkClassSchema.safeParse(invalid).success).toBe(false);
    }
    expect(validateClass("  LIGHT  ")).toBe("Light");
    expect(validateClass("heavy")).toBe("Heavy");
    expect(validateClass("Novel")).toBe("Novel");
    expect(validateClass(null)).toBe("[TBD]");
    expect(validateClass("unknown")).toBe("[TBD]");
  });

  it("keeps Priority parsing and defaulting case-sensitive", () => {
    for (const value of ["P1", "P2", "P3"] as const) {
      expect(PrioritySchema.parse(value)).toBe(value);
      expectTypeOf(PrioritySchema.parse(value)).toEqualTypeOf<Priority>();
    }
    for (const invalid of ["p1", "P0", "P4", "", " P1 ", null]) {
      expect(PrioritySchema.safeParse(invalid).success).toBe(false);
      expect(validatePriority(invalid)).toBe("P3");
    }
  });

  it("preserves value and type identity through the command-path shim", () => {
    expect(OldWorkUnitStateSchema).toBe(WorkUnitStateSchema);
    expect(OldWorkClassSchema).toBe(WorkClassSchema);
    expect(OldPrioritySchema).toBe(PrioritySchema);
    expect(OLD_WORK_UNIT_STATE_ORDER).toBe(WORK_UNIT_STATE_ORDER);
    expect(oldValidateState).toBe(validateState);
    expect(oldValidateClass).toBe(validateClass);
    expect(oldValidatePriority).toBe(validatePriority);
    expectTypeOf<OldWorkUnitState>().toEqualTypeOf<WorkUnitState>();
    expectTypeOf<OldWorkClass>().toEqualTypeOf<WorkClass>();
    expectTypeOf<OldPriority>().toEqualTypeOf<Priority>();
  });
});
