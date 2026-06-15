import { describe, it, expect } from "vitest";

import type { LifecycleIndex, LifecycleIndexEntry } from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { Location, Phase } from "../../../../src/lib/work-unit/lifecycle-state.js";
import {
  CONTEXT_DEFAULTING_VERBS,
  DISPATCH_MODE,
  SLUG_REQUIRED_VERBS,
  findVerbCandidates,
  formatVerbCandidates,
  selectVerbTarget,
  validFromStates,
} from "../../../../src/lib/work-unit/verbs/dispatch.js";

function entry(slug: string, phase: Phase, location: Location): LifecycleIndexEntry {
  return { slug, phase, location, cohort: null, dependsOn: [], path: `.arc/${location}/meta-${slug}.md` };
}

function indexOf(...entries: LifecycleIndexEntry[]): LifecycleIndex {
  return new Map(entries.map((e) => [e.slug, e]));
}

/** One entry per derived state — slug named for the state it resolves to. */
const everyState = indexOf(
  entry("a-provisional", "Planning", "provisional"),
  entry("b-planned", "Planning", "planned"),
  entry("c-planning", "Planning", "active"),
  entry("d-active", "Active", "active"),
  entry("e-integrating", "Integrating", "active"),
  entry("f-parked", "Active", "planned"),
  entry("g-shipped", "Shipped", "completed"),
);

describe("dispatch mode table", () => {
  it("classifies every context-defaulting verb", () => {
    for (const verb of CONTEXT_DEFAULTING_VERBS) {
      expect(DISPATCH_MODE[verb]).toBe("context-defaulting");
    }
  });

  it("classifies every slug-required verb", () => {
    for (const verb of SLUG_REQUIRED_VERBS) {
      expect(DISPATCH_MODE[verb]).toBe("slug-required");
    }
  });

  it("covers the two verb sets disjointly", () => {
    const context = new Set<string>(CONTEXT_DEFAULTING_VERBS);
    expect(SLUG_REQUIRED_VERBS.some((verb) => context.has(verb))).toBe(false);
  });
});

describe("selectVerbTarget — explicit slug", () => {
  it("resolves to the explicit slug regardless of mode", () => {
    expect(selectVerbTarget("park", "widget", null)).toEqual({ kind: "resolved", slug: "widget" });
    expect(selectVerbTarget("resume", "widget", null)).toEqual({ kind: "resolved", slug: "widget" });
  });

  it("trims surrounding whitespace and ignores the current-WU default", () => {
    expect(selectVerbTarget("park", "  widget  ", "current")).toEqual({ kind: "resolved", slug: "widget" });
  });
});

describe("selectVerbTarget — context-defaulting, no slug", () => {
  it("falls back to the current worktree's WU when one resolved", () => {
    expect(selectVerbTarget("park", undefined, "current-wu")).toEqual({ kind: "resolved", slug: "current-wu" });
  });

  it("needs candidates when no current WU resolved", () => {
    expect(selectVerbTarget("park", undefined, null)).toEqual({ kind: "needs-candidates" });
  });

  it("treats a whitespace-only slug as absent", () => {
    expect(selectVerbTarget("archive", "   ", null)).toEqual({ kind: "needs-candidates" });
  });
});

describe("selectVerbTarget — slug-required, no slug", () => {
  it("never defaults to the current WU, even when one resolved", () => {
    expect(selectVerbTarget("resume", undefined, "current-wu")).toEqual({ kind: "needs-candidates" });
    expect(selectVerbTarget("abandon", undefined, "current-wu")).toEqual({ kind: "needs-candidates" });
  });
});

describe("validFromStates — read off the transition table", () => {
  it("maps each verb to its legal from-states in table order", () => {
    expect(validFromStates("resume")).toEqual(["parked"]);
    expect(validFromStates("promote")).toEqual(["provisional"]);
    expect(validFromStates("demote")).toEqual(["planned"]);
    expect(validFromStates("activate")).toEqual(["planning"]);
    expect(validFromStates("deactivate")).toEqual(["active"]);
    expect(validFromStates("reopen")).toEqual(["integrating"]);
    expect(validFromStates("park")).toEqual(["active", "planning"]);
    expect(validFromStates("archive")).toEqual(["active", "integrating"]);
    expect(validFromStates("abandon")).toEqual(["provisional", "planned", "planning", "active", "parked"]);
  });

  it("is empty for a creation verb whose only source is nonexistent", () => {
    expect(validFromStates("stub")).toEqual([]);
  });
});

describe("findVerbCandidates — the bare-invocation actionable set", () => {
  it("lists only slugs whose state is a valid from-state for the verb", () => {
    expect(findVerbCandidates(everyState, "resume")).toEqual([{ slug: "f-parked", state: "parked" }]);
    expect(findVerbCandidates(everyState, "promote")).toEqual([{ slug: "a-provisional", state: "provisional" }]);
    expect(findVerbCandidates(everyState, "reopen")).toEqual([{ slug: "e-integrating", state: "integrating" }]);
  });

  it("spans every valid from-state for a multi-source verb", () => {
    expect(findVerbCandidates(everyState, "park")).toEqual([
      { slug: "c-planning", state: "planning" },
      { slug: "d-active", state: "active" },
    ]);
  });

  it("returns slugs sorted regardless of index insertion order", () => {
    const index = indexOf(entry("zebra", "Active", "planned"), entry("alpha", "Active", "planned"));
    expect(findVerbCandidates(index, "resume").map((c) => c.slug)).toEqual(["alpha", "zebra"]);
  });

  it("is empty when no work unit is in range", () => {
    expect(findVerbCandidates(indexOf(entry("only-active", "Active", "active")), "resume")).toEqual([]);
  });
});

describe("formatVerbCandidates — non-interactive surface", () => {
  it("groups candidate slugs by state and appends the usage line", () => {
    const candidates = [
      { slug: "foo", state: "parked" as const },
      { slug: "bar", state: "parked" as const },
    ];
    expect(formatVerbCandidates("resume", candidates)).toBe(
      "Parked: `bar`, `foo` · usage `arc resume <slug>`",
    );
  });

  it("orders groups by the verb's valid from-state order", () => {
    expect(formatVerbCandidates("park", findVerbCandidates(everyState, "park"))).toBe(
      "Active: `d-active` · Planning: `c-planning` · usage `arc park <slug>`",
    );
  });

  it("names the valid from-states when there are no candidates", () => {
    expect(formatVerbCandidates("resume", [])).toBe("No Parked work unit to resume · usage `arc resume <slug>`");
  });
});
