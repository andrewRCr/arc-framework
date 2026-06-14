import { describe, it, expect } from "vitest";

import type { LifecycleIndex, LifecycleIndexEntry } from "../../../src/lib/work-unit/lifecycle-index.js";
import {
  buildCohortMembership,
  isArchivalTriggered,
  resolveCohortMembers,
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

describe("resolveCohortMembers — membership projection over the index", () => {
  it("collects members spread across planned/, active/, and completed/ into the cohort", () => {
    const index = indexOf(
      entry("a", "planned", "lifecycle-state-machine"),
      entry("b", "active", "lifecycle-state-machine", "Active"),
      entry("c", "completed", "lifecycle-state-machine", "Shipped"),
    );

    expect(resolveCohortMembers(index, "lifecycle-state-machine")).toEqual(new Set(["a", "b", "c"]));
  });

  it("matches on the Cohort field value, not the filed directory (nested cohort path)", () => {
    // Filed flat in active/, but its field names a nested cohort path: the field wins.
    const index = indexOf({
      slug: "leaf",
      phase: "Active",
      location: "active",
      cohort: "core/sub",
      dependsOn: [],
      path: ".arc/active/meta-leaf.md",
    });

    expect(resolveCohortMembers(index, "core/sub")).toEqual(new Set(["leaf"]));
    // The leaf segment alone is not the membership key — the full field path is.
    expect(resolveCohortMembers(index, "sub")).toEqual(new Set());
  });

  it("excludes a non-member — a different or absent Cohort field", () => {
    const index = indexOf(
      entry("member", "planned", "alpha"),
      entry("other", "planned", "beta"),
      entry("standalone", "planned", null),
    );

    expect(resolveCohortMembers(index, "alpha")).toEqual(new Set(["member"]));
  });
});

describe("resolveCohortMembers — false-orphan regression (graduated vs. removed)", () => {
  it("counts a graduated member (field intact, now in active/) as a member, not an orphan", () => {
    // The member activated out of backlog/planned/ into flat active/, Cohort field intact.
    const index = indexOf(
      entry("graduated", "active", "lifecycle-state-machine", "Active"),
      entry("sibling", "planned", "lifecycle-state-machine"),
    );

    expect(resolveCohortMembers(index, "lifecycle-state-machine")).toContain("graduated");
  });

  it("omits a removed member — no meta anywhere — so the false-orphan flag has nothing to fire on", () => {
    const index = indexOf(entry("present", "planned", "lifecycle-state-machine"));

    const members = resolveCohortMembers(index, "lifecycle-state-machine");
    expect(members.has("removed")).toBe(false);
    expect(members).toEqual(new Set(["present"]));
  });
});

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

describe("isArchivalTriggered — last-member-shipped detection", () => {
  it("is true when every member resolves under completed/", () => {
    const index = indexOf(
      entry("a", "completed", "c", "Shipped"),
      entry("b", "completed", "c", "Shipped"),
    );

    expect(isArchivalTriggered(index, "c")).toBe(true);
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

    expect(isArchivalTriggered(lingerPlanned, "c")).toBe(false);
    expect(isArchivalTriggered(lingerActive, "c")).toBe(false);
  });

  it("is false on an empty membership set — no last member to trip", () => {
    // Only a standalone WU exists; cohort "c" has no members.
    const index = indexOf(entry("solo", "completed", null, "Shipped"));

    expect(isArchivalTriggered(index, "c")).toBe(false);
  });

  it("trips only as the final member crosses into completed/", () => {
    const beforeLastShips = indexOf(
      entry("a", "completed", "c", "Shipped"),
      entry("b", "completed", "c", "Shipped"),
      entry("tail", "active", "c", "Active"),
    );
    expect(isArchivalTriggered(beforeLastShips, "c")).toBe(false);

    const afterLastShips = indexOf(
      entry("a", "completed", "c", "Shipped"),
      entry("b", "completed", "c", "Shipped"),
      entry("tail", "completed", "c", "Shipped"),
    );
    expect(isArchivalTriggered(afterLastShips, "c")).toBe(true);
  });
});
