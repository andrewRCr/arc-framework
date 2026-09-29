import { describe, it, expect } from "vitest";

import { buildLifecycleIndexFromMetas } from "../../../src/lib/work-unit/lifecycle-index.js";
import { resolveSlugQuery } from "../../../src/lib/work-unit/lifecycle-query.js";

/** Minimal valid meta — H1 plus the flat-bullet `State` and an optional `Depends On` edge list. */
function meta(state: string, dependsOn?: string[]): string {
  const lines = ["# Metadata: x", "", `- **State:** ${state}`];
  if (dependsOn !== undefined) {
    const value = dependsOn.length === 0 ? "[none]" : dependsOn.map((s) => `\`${s}\``).join(", ");
    lines.push(`- **Depends On:** ${value}`);
  }
  return `${lines.join("\n")}\n`;
}

const index = buildLifecycleIndexFromMetas([
  { path: ".arc/active/meta-live.md", content: meta("Active", ["shipped-dep", "integrating-dep"]) },
  { path: ".arc/completed/2026-q2/01_shipped-dep/meta-shipped-dep.md", content: meta("Shipped") },
  { path: ".arc/active/meta-integrating-dep.md", content: meta("Integrating") },
]);

describe("resolveSlugQuery", () => {
  it("assembles the full query for a resolved WU — pair, enum, predicates, and dep states", () => {
    expect(resolveSlugQuery(index, "live")).toEqual({
      slug: "live",
      position: { phase: "Active", location: "active" },
      state: "active",
      occupied: true,
      shipped: false,
      dependsOn: [
        { slug: "shipped-dep", landed: true },
        { slug: "integrating-dep", landed: false },
      ],
    });
  });

  it("reports a shipped WU as shipped and not occupied", () => {
    expect(resolveSlugQuery(index, "shipped-dep")).toEqual({
      slug: "shipped-dep",
      position: { phase: "Shipped", location: "completed" },
      state: "shipped",
      occupied: false,
      shipped: true,
      dependsOn: [],
    });
  });

  it("totalizes an absent slug to nonexistent with a null position and no edges", () => {
    expect(resolveSlugQuery(index, "ghost")).toEqual({
      slug: "ghost",
      position: null,
      state: "nonexistent",
      occupied: false,
      shipped: false,
      dependsOn: [],
    });
  });
});
