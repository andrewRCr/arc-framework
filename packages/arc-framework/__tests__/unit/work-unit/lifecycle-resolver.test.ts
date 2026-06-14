import { describe, it, expect } from "vitest";

import type { LifecycleIndex, LifecycleIndexEntry } from "../../../src/lib/work-unit/lifecycle-index.js";
import {
  deriveState,
  resolveSlugPosition,
  resolveSlugState,
} from "../../../src/lib/work-unit/lifecycle-resolver.js";
import type { Location, Phase } from "../../../src/lib/work-unit/lifecycle-state.js";

function entry(slug: string, phase: Phase, location: Location): LifecycleIndexEntry {
  return { slug, phase, location, cohort: null, path: `.arc/${location}/meta-${slug}.md` };
}

function indexOf(...entries: LifecycleIndexEntry[]): LifecycleIndex {
  return new Map(entries.map((e) => [e.slug, e]));
}

describe("resolveSlugPosition", () => {
  it("returns the (phase, location) pair for a slug in the index", () => {
    const index = indexOf(entry("foo", "Active", "active"));
    expect(resolveSlugPosition(index, "foo")).toEqual({ phase: "Active", location: "active" });
  });

  it("returns null for a slug in no tier", () => {
    expect(resolveSlugPosition(indexOf(), "missing")).toBeNull();
  });
});

describe("deriveState — canonical matrix", () => {
  it("maps every canonical (phase, location) pair to its enum value", () => {
    expect(deriveState({ phase: "Planning", location: "provisional" })).toBe("provisional");
    expect(deriveState({ phase: "Planning", location: "planned" })).toBe("planned");
    expect(deriveState({ phase: "Planning", location: "active" })).toBe("planning");
    expect(deriveState({ phase: "Active", location: "active" })).toBe("active");
    expect(deriveState({ phase: "Integrating", location: "active" })).toBe("integrating");
    expect(deriveState({ phase: "Active", location: "planned" })).toBe("parked");
    expect(deriveState({ phase: "Shipped", location: "completed" })).toBe("shipped");
  });

  it("resolves the absent case to nonexistent", () => {
    expect(deriveState(null)).toBe("nonexistent");
  });
});

describe("deriveState — directory-dominant lag tiebreak", () => {
  it("reads a completed/ meta whose State trails as shipped", () => {
    // Archival lag: still tagged Integrating but physically in completed/.
    expect(deriveState({ phase: "Integrating", location: "completed" })).toBe("shipped");
    expect(deriveState({ phase: "Planning", location: "completed" })).toBe("shipped");
  });

  it("reads a Shipped-tagged meta still in active/ as active — the directory wins", () => {
    expect(deriveState({ phase: "Shipped", location: "active" })).toBe("active");
  });

  it("falls to the location for any other residual combo", () => {
    expect(deriveState({ phase: "Integrating", location: "planned" })).toBe("planned");
    expect(deriveState({ phase: "Shipped", location: "provisional" })).toBe("provisional");
  });
});

describe("resolveSlugState", () => {
  it("composes index lookup with derivation across the index", () => {
    const index = indexOf(
      entry("alpha", "Planning", "planned"),
      entry("beta", "Active", "planned"),
      entry("gamma", "Integrating", "active"),
      entry("delta", "Shipped", "completed"),
    );

    expect(resolveSlugState(index, "alpha")).toBe("planned");
    expect(resolveSlugState(index, "beta")).toBe("parked");
    expect(resolveSlugState(index, "gamma")).toBe("integrating");
    expect(resolveSlugState(index, "delta")).toBe("shipped");
    expect(resolveSlugState(index, "missing")).toBe("nonexistent");
  });
});
