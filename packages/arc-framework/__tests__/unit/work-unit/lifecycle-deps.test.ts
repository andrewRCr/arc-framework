import { describe, it, expect } from "vitest";

import { buildLifecycleIndexFromMetas } from "../../../src/lib/work-unit/lifecycle-index.js";
import { resolveDepStates, resolveReverseDeps } from "../../../src/lib/work-unit/lifecycle-deps.js";

/** Minimal valid meta — H1 plus the flat-bullet `State` and an optional `Depends On` edge list. */
function meta(state: string, dependsOn?: string[]): string {
  const lines = ["# Metadata: x", "", `- **State:** ${state}`];
  if (dependsOn !== undefined) {
    const value = dependsOn.length === 0 ? "[none]" : dependsOn.map((s) => `\`${s}\``).join(", ");
    lines.push(`- **Depends On:** ${value}`);
  }
  return `${lines.join("\n")}\n`;
}

/** A lifecycle index with one dependent WU plus a shipped and an integrating dependency. */
function index(dependsOn: string[]) {
  return buildLifecycleIndexFromMetas([
    { path: ".arc/active/meta-dependent.md", content: meta("Active", dependsOn) },
    { path: ".arc/completed/2026-q2/01_shipped-dep/meta-shipped-dep.md", content: meta("Shipped") },
    { path: ".arc/active/meta-integrating-dep.md", content: meta("Integrating") },
  ]);
}

describe("resolveDepStates", () => {
  it("reads an edge to a shipped (merged) dependency as landed", () => {
    const states = resolveDepStates(index(["shipped-dep"]), "dependent");

    expect(states).toEqual([{ slug: "shipped-dep", landed: true }]);
  });

  it("reads an edge to an integrating (unmerged) dependency as not-landed", () => {
    const states = resolveDepStates(index(["integrating-dep"]), "dependent");

    expect(states).toEqual([{ slug: "integrating-dep", landed: false }]);
  });

  it("resolves multiple edges independently, preserving order", () => {
    const states = resolveDepStates(index(["shipped-dep", "integrating-dep"]), "dependent");

    expect(states).toEqual([
      { slug: "shipped-dep", landed: true },
      { slug: "integrating-dep", landed: false },
    ]);
  });

  it("returns no edges for a WU with no Depends On edges", () => {
    expect(resolveDepStates(index([]), "dependent")).toEqual([]);
  });

  it("returns no edges for a slug absent from the index", () => {
    expect(resolveDepStates(index(["shipped-dep"]), "ghost")).toEqual([]);
  });
});

describe("resolveReverseDeps", () => {
  it("finds every dependent that names the origin, across the active and planned tiers", () => {
    const reverse = resolveReverseDeps(
      buildLifecycleIndexFromMetas([
        { path: ".arc/active/meta-origin.md", content: meta("Active") },
        { path: ".arc/active/meta-active-dep.md", content: meta("Active", ["origin"]) },
        { path: ".arc/backlog/planned/cohort-x/planned-dep/meta-planned-dep.md", content: meta("Planning", ["origin"]) },
        { path: ".arc/active/meta-unrelated.md", content: meta("Active", ["something-else"]) },
      ]),
      "origin",
    );

    expect(reverse).toEqual(["active-dep", "planned-dep"]);
  });

  it("returns empty when nothing depends on the origin", () => {
    const reverse = resolveReverseDeps(
      buildLifecycleIndexFromMetas([
        { path: ".arc/active/meta-origin.md", content: meta("Active") },
        { path: ".arc/active/meta-loner.md", content: meta("Active", []) },
      ]),
      "origin",
    );

    expect(reverse).toEqual([]);
  });

  it("counts only genuine Depends On edges, not an incidental mention of the origin name", () => {
    const prose = "# Metadata: x\n\n- **State:** Active\n- **Depends On:** [none]\n\nNotes: blocked behind origin earlier.\n";
    const reverse = resolveReverseDeps(
      buildLifecycleIndexFromMetas([
        { path: ".arc/active/meta-origin.md", content: meta("Active") },
        { path: ".arc/active/meta-prose-only.md", content: prose },
      ]),
      "origin",
    );

    expect(reverse).toEqual([]);
  });

  it("excludes a completed dependent — a shipped edge is immutable, not re-pointed", () => {
    const reverse = resolveReverseDeps(
      buildLifecycleIndexFromMetas([
        { path: ".arc/active/meta-origin.md", content: meta("Active") },
        { path: ".arc/completed/2026-q2/01_shipped/meta-shipped.md", content: meta("Shipped", ["origin"]) },
        { path: ".arc/active/meta-active-dep.md", content: meta("Active", ["origin"]) },
      ]),
      "origin",
    );

    expect(reverse).toEqual(["active-dep"]);
  });
});
