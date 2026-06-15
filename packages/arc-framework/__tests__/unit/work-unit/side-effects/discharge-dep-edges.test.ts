/**
 * Unit tests for the `discharge-dep-edges` side-effect — the write half of
 * dep-edge discharge, fired at `activate`.
 *
 * `Depends On` is treated as the **live scheduling gate** (per the operational-
 * state-docs lean): activating a WU examines each edge and resolves the satisfied
 * ones off the field, leaving only the genuinely-blocking deps. The readiness
 * verdict is composed over the resolver's enum — `shipped ∨ integrating` (the
 * team-review-latency / stacked-delivery case) — never redefining `shipped?`.
 * "Resolve" is not "destroy": lineage lives in provenance (git history, the
 * archive, spec prose), so a discharged edge is simply dropped from the gate. The
 * index and the meta read/write reach the mechanic as injected seams.
 */

import { describe, it, expect } from "vitest";

import { parseMetaRecord } from "../../../../src/lib/active/meta-reader.js";
import { buildLifecycleIndexFromMetas } from "../../../../src/lib/work-unit/lifecycle-index.js";
import {
  dischargeDepEdges,
  type DischargeDepEdgesContext,
} from "../../../../src/lib/work-unit/side-effects/discharge-dep-edges.js";

/** Minimal valid meta — H1 plus the flat-bullet `State` and an optional `Depends On` edge list. */
function meta(state: string, dependsOn?: string[]): string {
  const lines = ["# Metadata: x", "", `- **State:** ${state}`];
  if (dependsOn !== undefined) {
    const value = dependsOn.length === 0 ? "[none]" : dependsOn.map((s) => `\`${s}\``).join(", ");
    lines.push(`- **Depends On:** ${value}`);
  }
  return `${lines.join("\n")}\n`;
}

const DEPENDENT_PATH = ".arc/active/meta-dependent.md";

/**
 * Build a discharge context over an index of one dependent plus dependencies in
 * the named states, with an in-memory meta read/write keyed on path.
 */
function buildCtx(dependsOn: string[]): { ctx: DischargeDepEdgesContext; writes: string[] } {
  const metas = [
    { path: DEPENDENT_PATH, content: meta("Active", dependsOn) },
    { path: ".arc/completed/2026-q2/01_shipped-dep/meta-shipped-dep.md", content: meta("Shipped") },
    { path: ".arc/active/meta-integrating-dep.md", content: meta("Integrating") },
    { path: ".arc/active/meta-active-dep.md", content: meta("Active") },
    { path: ".arc/backlog/planned/planned-dep/meta-planned-dep.md", content: meta("Planning") },
  ];
  const files = new Map(metas.map((m) => [m.path, m.content]));
  const writes: string[] = [];

  const ctx: DischargeDepEdgesContext = {
    index: buildLifecycleIndexFromMetas(metas),
    readMeta: (path) => {
      const content = files.get(path);
      return content === undefined ? Promise.reject(new Error(`ENOENT: ${path}`)) : Promise.resolve(content);
    },
    writeMeta: (path, content) => {
      files.set(path, content);
      writes.push(content);
      return Promise.resolve();
    },
  };

  return { ctx, writes };
}

describe("dischargeDepEdges — the readiness verdict (shipped ∨ integrating)", () => {
  it("discharges a shipped (landed) dependency off the gate", async () => {
    const { ctx, writes } = buildCtx(["shipped-dep", "active-dep"]);

    const result = await dischargeDepEdges(ctx, { slug: "dependent", metaPath: DEPENDENT_PATH });

    expect(result.discharged).toEqual(["shipped-dep"]);
    expect(result.live).toEqual(["active-dep"]);
    // The gate is rewritten to the live set only.
    expect(parseMetaRecord(writes[0]!)["Depends On"]).toBe("active-dep");
  });

  it("discharges an integrating dependency too (the team-review-latency case)", async () => {
    const { ctx, writes } = buildCtx(["integrating-dep", "active-dep"]);

    const result = await dischargeDepEdges(ctx, { slug: "dependent", metaPath: DEPENDENT_PATH });

    expect(result.discharged).toEqual(["integrating-dep"]);
    expect(result.live).toEqual(["active-dep"]);
    expect(parseMetaRecord(writes[0]!)["Depends On"]).toBe("active-dep");
  });

  it("clears the gate to [none] when every edge is satisfied", async () => {
    const { ctx, writes } = buildCtx(["shipped-dep", "integrating-dep"]);

    const result = await dischargeDepEdges(ctx, { slug: "dependent", metaPath: DEPENDENT_PATH });

    expect(result.discharged).toEqual(["shipped-dep", "integrating-dep"]);
    expect(result.live).toEqual([]);
    expect(parseMetaRecord(writes[0]!)["Depends On"]).toBe("[none]");
  });
});

describe("dischargeDepEdges — live edges stay", () => {
  it("leaves an only-planning/active dependency on the gate, writing nothing", async () => {
    const { ctx, writes } = buildCtx(["active-dep", "planned-dep"]);

    const result = await dischargeDepEdges(ctx, { slug: "dependent", metaPath: DEPENDENT_PATH });

    expect(result.discharged).toEqual([]);
    expect(result.live).toEqual(["active-dep", "planned-dep"]);
    // Nothing satisfied → no meta rewrite.
    expect(writes).toEqual([]);
  });
});
