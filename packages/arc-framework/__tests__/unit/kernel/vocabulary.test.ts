import { describe, expect, expectTypeOf, it } from "vitest";

import {
  PrioritySchema,
  WORK_UNIT_STATE_ORDER,
  WorkClassSchema,
  WorkUnitStateSchema,
  validateClass,
  validatePriority,
  validateState,
  type Priority,
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
