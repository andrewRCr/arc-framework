import { describe, it, expect } from "vitest";

import type { LifecycleIndex, LifecycleIndexEntry } from "../../../src/lib/work-unit/lifecycle-index.js";
import {
  buildCohortMembership,
  isArchivalTriggeredWithDescendants,
} from "../../../src/lib/work-unit/lifecycle-membership.js";
import type { Location, Phase } from "../../../src/lib/work-unit/lifecycle-state.js";

function entry(
  slug: string,
  location: Location,
  cohort: string | null,
  phase: Phase = "Planning",
): LifecycleIndexEntry {
  return { slug, phase, location, cohort, dependsOn: [], path: `.arc/${location}/meta-${slug}.md` };
}

function indexOf(...entries: LifecycleIndexEntry[]): LifecycleIndex {
  return new Map(entries.map((e) => [e.slug, e]));
}

describe("buildCohortMembership — full cohort→members grouping", () => {
  it("groups every cohort-bearing entry by its field value, skipping standalone WUs", () => {
    const index = indexOf(
      entry("a", "planned", "alpha"),
      entry("b", "active", "alpha", "Active"),
      entry("c", "completed", "beta", "Shipped"),
      entry("solo", "planned", null),
    );

    const membership = buildCohortMembership(index);

    expect(membership.get("alpha")).toEqual(new Set(["a", "b"]));
    expect(membership.get("beta")).toEqual(new Set(["c"]));
    // A standalone WU (null cohort) contributes no key.
    expect([...membership.keys()].sort()).toEqual(["alpha", "beta"]);
  });

  it("returns a fresh map per call — no shared mutable state across invocations", () => {
    const index = indexOf(entry("a", "planned", "alpha"));

    const first = buildCohortMembership(index);
    const second = buildCohortMembership(index);

    expect(first).not.toBe(second);
    expect(first.get("alpha")).toEqual(second.get("alpha"));
  });
});

describe("isArchivalTriggeredWithDescendants — last-member-shipped detection", () => {
  it("is true when every member resolves under completed/", () => {
    const index = indexOf(
      entry("a", "completed", "c", "Shipped"),
      entry("b", "completed", "c", "Shipped"),
    );

    expect(isArchivalTriggeredWithDescendants(index, "c")).toBe(true);
  });

  it("is false when any member remains in planned/ or active/", () => {
    const lingerPlanned = indexOf(
      entry("a", "completed", "c", "Shipped"),
      entry("b", "planned", "c"),
    );
    const lingerActive = indexOf(
      entry("a", "completed", "c", "Shipped"),
      entry("b", "active", "c", "Active"),
    );

    expect(isArchivalTriggeredWithDescendants(lingerPlanned, "c")).toBe(false);
    expect(isArchivalTriggeredWithDescendants(lingerActive, "c")).toBe(false);
  });

  it("is false on an empty membership set — no last member to trip", () => {
    // Only a standalone WU exists; cohort "c" has no members.
    const index = indexOf(entry("solo", "completed", null, "Shipped"));

    expect(isArchivalTriggeredWithDescendants(index, "c")).toBe(false);
  });

  it("trips only as the final member crosses into completed/", () => {
    const beforeLastShips = indexOf(
      entry("a", "completed", "c", "Shipped"),
      entry("b", "completed", "c", "Shipped"),
      entry("tail", "active", "c", "Active"),
    );
    expect(isArchivalTriggeredWithDescendants(beforeLastShips, "c")).toBe(false);

    const afterLastShips = indexOf(
      entry("a", "completed", "c", "Shipped"),
      entry("b", "completed", "c", "Shipped"),
      entry("tail", "completed", "c", "Shipped"),
    );
    expect(isArchivalTriggeredWithDescendants(afterLastShips, "c")).toBe(true);
  });
});

describe("isArchivalTriggeredWithDescendants — nested-parent archival detection", () => {
  it("triggers for a leaf cohort with no subcohorts", () => {
    const index = indexOf(
      entry("a", "completed", "c", "Shipped"),
      entry("b", "completed", "c", "Shipped"),
    );

    expect(isArchivalTriggeredWithDescendants(index, "c")).toBe(true);
  });

  it("counts subcohort members as descendants — false while a subcohort member lingers", () => {
    const index = indexOf(
      entry("direct", "completed", "parent", "Shipped"),
      entry("sub-a", "completed", "parent/sub", "Shipped"),
      entry("sub-b", "active", "parent/sub", "Active"),
    );

    // A lingering subcohort member keeps its parent open.
    expect(isArchivalTriggeredWithDescendants(index, "parent")).toBe(false);
  });

  it("is true when every direct and subcohort member has shipped", () => {
    const index = indexOf(
      entry("direct", "completed", "parent", "Shipped"),
      entry("sub-a", "completed", "parent/sub", "Shipped"),
      entry("sub-b", "completed", "parent/sub2", "Shipped"),
    );

    expect(isArchivalTriggeredWithDescendants(index, "parent")).toBe(true);
  });

  it("triggers for a parent that is only a container of subcohorts (no direct members)", () => {
    const index = indexOf(entry("sub-a", "completed", "parent/sub", "Shipped"));

    expect(isArchivalTriggeredWithDescendants(index, "parent")).toBe(true);
  });

  it("does not treat a sibling-prefixed cohort as a descendant", () => {
    // `parent-other` shares a textual prefix but is not nested under `parent`.
    const index = indexOf(
      entry("direct", "completed", "parent", "Shipped"),
      entry("sibling", "active", "parent-other", "Active"),
    );

    expect(isArchivalTriggeredWithDescendants(index, "parent")).toBe(true);
  });

  it("is false on an empty membership set — no descendants to trip", () => {
    const index = indexOf(entry("solo", "completed", null, "Shipped"));

    expect(isArchivalTriggeredWithDescendants(index, "parent")).toBe(false);
  });
});
