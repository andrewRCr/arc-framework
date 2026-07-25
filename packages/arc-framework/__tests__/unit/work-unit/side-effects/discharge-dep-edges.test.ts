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
import { canonicalDigest } from "../../../../src/lib/canonical/canonical-json.js";
import { receiptId } from "../../../../src/lib/canonical/receipt-id.js";
import { buildLifecycleIndexFromMetas } from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { RetirementReceipt } from "../../../../src/lib/work-unit/retirement-authority.js";
import type {
  RetirementRecordEnumerationResult,
} from "../../../../src/lib/work-unit/retirement-record-enumeration.js";
import type {
  RetirementDispositionQueryResult,
} from "../../../../src/lib/work-unit/retirement-disposition-query.js";
import {
  dischargeDepEdges,
  planDependencyReconcile,
  runCurrentWuReconcile,
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

function queryResults(
  results: Readonly<Record<string, RetirementDispositionQueryResult>>,
): (input: { retiredSubject: string }) => Promise<RetirementDispositionQueryResult> {
  return ({ retiredSubject }) => Promise.resolve(results[retiredSubject] ?? { status: "absent" });
}

function renameEnumeration(
  retiredSubject = "origin",
  targetSlug = "successor",
): RetirementRecordEnumerationResult {
  const subject = { kind: "work-unit", name: retiredSubject } as const;
  const source = {
    branch: `feat/${retiredSubject}`,
    head: "a".repeat(40),
    artifactDigest: canonicalDigest(`source:${retiredSubject}`),
  };
  const candidate: RetirementReceipt = {
    schemaVersion: 1,
    receiptId: receiptId({
      schemaVersion: 1,
      subject,
      transition: "rename",
      sourceBranch: source.branch,
      sourceHead: source.head,
    }),
    subject,
    transition: "rename",
    source,
    transitionPatchDigest: canonicalDigest(`patch:${retiredSubject}`),
    retiringProjection: { kind: "direct-transition" },
    authorization: "identity-renamed",
    result: {
      kind: "rename",
      targetSlug,
      artifactDigest: canonicalDigest(`target:${targetSlug}`),
    },
  };
  return {
    status: "valid",
    records: [{
      id: candidate.receiptId,
      content: "",
      record: { kind: "receipt", value: candidate },
    }],
  };
}

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
    { path: ".arc/backlog/planned/parked-dep/meta-parked-dep.md", content: meta("Active") },
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

    expect(result.discharged).toEqual(["integrating-dep", "shipped-dep"]);
    expect(result.live).toEqual([]);
    expect(parseMetaRecord(writes[0]!)["Depends On"]).toBe("[none]");
  });
});

describe("dischargeDepEdges — live edges stay", () => {
  it("leaves an only-planning/active dependency on the gate, writing nothing", async () => {
    const { ctx, writes } = buildCtx(["active-dep", "parked-dep", "planned-dep"]);

    const result = await dischargeDepEdges(ctx, { slug: "dependent", metaPath: DEPENDENT_PATH });

    expect(result.discharged).toEqual([]);
    expect(result.live).toEqual(["active-dep", "parked-dep", "planned-dep"]);
    // Nothing satisfied → no meta rewrite.
    expect(writes).toEqual([]);
  });

  it("returns a non-overlapping conservative projection when any edge conflicts", async () => {
    const { ctx, writes } = buildCtx(["shipped-dep", "missing-dep"]);

    const result = await dischargeDepEdges(ctx, { slug: "dependent", metaPath: DEPENDENT_PATH });

    expect(result).toEqual({
      discharged: [],
      live: ["missing-dep", "shipped-dep"],
    });
    expect(writes).toEqual([]);
  });
});

describe("current-WU dependency reconcile planning", () => {
  it("replaces one retired edge with its deduplicated delivering members", async () => {
    const index = buildLifecycleIndexFromMetas([
      { path: DEPENDENT_PATH, content: meta("Active", ["origin"]) },
      { path: ".arc/active/meta-member-a.md", content: meta("Active") },
      { path: ".arc/active/meta-member-b.md", content: meta("Active") },
    ]);

    const result = await planDependencyReconcile({
      index,
      dependentSlug: "dependent",
      edges: ["origin"],
      queryDisposition: async () => ({
        status: "unique",
        evidenceQuality: "reachable",
        disposition: {
          kind: "replace",
          replacementTargets: ["member-b", "member-a", "member-a"],
        },
      }),
    });

    expect(result).toMatchObject({
      status: "ready",
      dependency: {
        after: ["member-a", "member-b"],
        replacements: [{
          retiredSubject: "origin",
          replacementTargets: ["member-a", "member-b"],
          evidence: [{ subject: "origin", quality: "reachable" }],
        }],
        conflicts: [],
      },
    });
  });

  it.each([
    {
      label: "authored decompose drop",
      resolution: {
        status: "unique",
        evidenceQuality: "degraded",
        disposition: { kind: "drop", reason: "not retained" },
      } satisfies RetirementDispositionQueryResult,
      reason: "not retained",
    },
    {
      label: "abandon",
      resolution: {
        status: "unique",
        evidenceQuality: "unknown",
        disposition: { kind: "abandoned" },
      } satisfies RetirementDispositionQueryResult,
      reason: "retired work unit was abandoned",
    },
  ])("drops an edge retired by $label while surfacing its reason", async ({ resolution, reason }) => {
    const result = await planDependencyReconcile({
      index: buildLifecycleIndexFromMetas([
        { path: DEPENDENT_PATH, content: meta("Active", ["origin"]) },
      ]),
      dependentSlug: "dependent",
      edges: ["origin"],
      queryDisposition: queryResults({ origin: resolution }),
    });

    expect(result).toMatchObject({
      status: "ready",
      dependency: {
        after: [],
        drops: [{ retiredSubject: "origin", reason }],
      },
    });
  });

  it("follows multiple rename hops once to the final live slug", async () => {
    const result = await planDependencyReconcile({
      index: buildLifecycleIndexFromMetas([
        { path: DEPENDENT_PATH, content: meta("Active", ["origin"]) },
        { path: ".arc/active/meta-successor.md", content: meta("Active") },
      ]),
      dependentSlug: "dependent",
      edges: ["origin"],
      queryDisposition: queryResults({
        origin: {
          status: "unique",
          evidenceQuality: "unknown",
          disposition: { kind: "retarget", targetSlug: "renamed-once" },
        },
        "renamed-once": {
          status: "unique",
          evidenceQuality: "degraded",
          disposition: { kind: "retarget", targetSlug: "successor" },
        },
      }),
    });

    expect(result).toMatchObject({
      status: "ready",
      dependency: {
        after: ["successor"],
        replacements: [{
          retiredSubject: "origin",
          replacementTargets: ["successor"],
          evidence: [
            { subject: "origin", quality: "unknown" },
            { subject: "renamed-once", quality: "degraded" },
          ],
        }],
      },
    });
  });

  it("applies a terminal decompose disposition after a rename chain", async () => {
    const result = await planDependencyReconcile({
      index: buildLifecycleIndexFromMetas([
        { path: DEPENDENT_PATH, content: meta("Active", ["origin"]) },
        { path: ".arc/active/meta-member.md", content: meta("Active") },
      ]),
      dependentSlug: "dependent",
      edges: ["origin"],
      queryDisposition: queryResults({
        origin: {
          status: "unique",
          evidenceQuality: "reachable",
          disposition: { kind: "retarget", targetSlug: "renamed" },
        },
        renamed: {
          status: "unique",
          evidenceQuality: "tree-only",
          disposition: { kind: "replace", replacementTargets: ["member"] },
        },
      }),
    });

    expect(result).toMatchObject({
      status: "ready",
      dependency: {
        after: ["member"],
        replacements: [{
          replacementTargets: ["member"],
          evidence: [
            { subject: "origin", quality: "reachable" },
            { subject: "renamed", quality: "tree-only" },
          ],
        }],
      },
    });
  });

  it("applies a terminal abandon disposition after a rename chain", async () => {
    const result = await planDependencyReconcile({
      index: buildLifecycleIndexFromMetas([
        { path: DEPENDENT_PATH, content: meta("Active", ["origin"]) },
      ]),
      dependentSlug: "dependent",
      edges: ["origin"],
      queryDisposition: queryResults({
        origin: {
          status: "unique",
          evidenceQuality: "reachable",
          disposition: { kind: "retarget", targetSlug: "renamed" },
        },
        renamed: {
          status: "unique",
          evidenceQuality: "unknown",
          disposition: { kind: "abandoned" },
        },
      }),
    });

    expect(result).toMatchObject({
      status: "ready",
      dependency: {
        after: [],
        drops: [{
          reason: "retired work unit was abandoned",
          evidence: [
            { subject: "origin", quality: "reachable" },
            { subject: "renamed", quality: "unknown" },
          ],
        }],
      },
    });
  });

  it.each([
    ["missing evidence", { status: "absent" }, "missing-evidence"],
    ["ambiguous evidence", { status: "ambiguous" }, "ambiguous-evidence"],
    ["unmapped evidence", { status: "unmapped-dependent", evidenceQuality: "degraded" }, "unmapped-dependent"],
    ["version conflict", { status: "version-conflict" }, "version-conflict"],
    ["corrupt namespace", { status: "namespace-corrupt" }, "namespace-corrupt"],
  ] as const)("refuses %s without producing a rewrite", async (_label, resolution, reason) => {
    const result = await planDependencyReconcile({
      index: buildLifecycleIndexFromMetas([
        { path: DEPENDENT_PATH, content: meta("Active", ["origin"]) },
      ]),
      dependentSlug: "dependent",
      edges: ["origin"],
      queryDisposition: queryResults({ origin: resolution }),
    });

    expect(result).toMatchObject({
      status: "conflict",
      dependency: {
        before: ["origin"],
        after: ["origin"],
        conflicts: [{ edge: "origin", subject: "origin", reason }],
      },
    });
  });

  it("refuses rename cycles and self-dependencies", async () => {
    const index = buildLifecycleIndexFromMetas([
      { path: DEPENDENT_PATH, content: meta("Active", ["origin"]) },
    ]);
    const cycle = await planDependencyReconcile({
      index,
      dependentSlug: "dependent",
      edges: ["origin"],
      queryDisposition: queryResults({
        origin: {
          status: "unique",
          evidenceQuality: "reachable",
          disposition: { kind: "retarget", targetSlug: "renamed" },
        },
        renamed: {
          status: "unique",
          evidenceQuality: "reachable",
          disposition: { kind: "retarget", targetSlug: "origin" },
        },
      }),
    });
    expect(cycle).toMatchObject({
      status: "conflict",
      dependency: { conflicts: [{ reason: "rename-cycle" }] },
    });

    const self = await planDependencyReconcile({
      index,
      dependentSlug: "dependent",
      edges: ["dependent"],
      queryDisposition: queryResults({}),
    });
    expect(self).toMatchObject({
      status: "conflict",
      dependency: { conflicts: [{ reason: "self-dependency" }] },
    });
  });

  it("refuses a missing decompose replacement target", async () => {
    const result = await planDependencyReconcile({
      index: buildLifecycleIndexFromMetas([
        { path: DEPENDENT_PATH, content: meta("Active", ["origin"]) },
      ]),
      dependentSlug: "dependent",
      edges: ["origin"],
      queryDisposition: queryResults({
        origin: {
          status: "unique",
          evidenceQuality: "reachable",
          disposition: { kind: "replace", replacementTargets: ["missing"] },
        },
      }),
    });

    expect(result).toMatchObject({
      status: "conflict",
      dependency: { conflicts: [{ subject: "missing", reason: "missing-target" }] },
    });
  });
});

describe("current-WU dependency reconcile apply", () => {
  const captureCleanIndex = () => Promise.resolve(() => Promise.resolve());
  const original = meta("Active", ["origin"]);
  const index = buildLifecycleIndexFromMetas([
    { path: DEPENDENT_PATH, content: original },
    { path: ".arc/active/meta-successor.md", content: meta("Active") },
  ]);
  const queryDisposition = queryResults({
    origin: {
      status: "unique",
      evidenceQuality: "reachable",
      disposition: { kind: "retarget", targetSlug: "successor" },
    },
  });

  it("reports a pending exact edit without mutating in read-only mode", async () => {
    const writes: string[] = [];
    const stages: Array<readonly string[]> = [];
    const result = await runCurrentWuReconcile({
      index,
      queryDisposition,
      readFile: async () => original,
      writeFile: async (_path, content) => { writes.push(content); },
      stagePaths: async (paths) => { stages.push(paths); },
      captureIndexState: captureCleanIndex,
    }, { slug: "dependent", metaPath: DEPENDENT_PATH, apply: false });

    expect(result).toMatchObject({
      status: "pending",
      prepared: {
        edits: [{ path: DEPENDENT_PATH }],
        plan: { dependency: { after: ["successor"] } },
      },
    });
    expect(writes).toEqual([]);
    expect(stages).toEqual([]);
  });

  it("writes and stages only the exact dependent-owned meta path", async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const stages: Array<readonly string[]> = [];
    const result = await runCurrentWuReconcile({
      index,
      queryDisposition,
      readFile: async () => original,
      writeFile: async (path, content) => { writes.push({ path, content }); },
      stagePaths: async (paths) => { stages.push(paths); },
      captureIndexState: captureCleanIndex,
    }, { slug: "dependent", metaPath: DEPENDENT_PATH, apply: true });

    expect(result).toMatchObject({ status: "applied", stagedPaths: [DEPENDENT_PATH] });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(DEPENDENT_PATH);
    expect(parseMetaRecord(writes[0]!.content)["Depends On"]).toBe("successor");
    expect(stages).toEqual([[DEPENDENT_PATH]]);
  });

  it("refuses stale content before the first write or stage", async () => {
    let reads = 0;
    const writes: string[] = [];
    const stages: Array<readonly string[]> = [];
    const result = await runCurrentWuReconcile({
      index,
      queryDisposition,
      readFile: async () => reads++ === 0 ? original : meta("Active", ["changed"]),
      writeFile: async (_path, content) => { writes.push(content); },
      stagePaths: async (paths) => { stages.push(paths); },
      captureIndexState: captureCleanIndex,
    }, { slug: "dependent", metaPath: DEPENDENT_PATH, apply: true });

    expect(result).toMatchObject({ status: "conflict", reason: "stale-content" });
    expect(writes).toEqual([]);
    expect(stages).toEqual([]);
  });

  it("discovers a structured reference transition without a Depends On edge", async () => {
    const metaContent = meta("Active", []);
    const specPath = ".arc/active/spec-dependent.md";
    const specContent = "See `spec-origin.md`.\n";
    const files = new Map([[DEPENDENT_PATH, metaContent], [specPath, specContent]]);
    const result = await runCurrentWuReconcile({
      index,
      queryDisposition: () => Promise.resolve({ status: "absent" }),
      enumerateRetirementRecords: () => Promise.resolve(renameEnumeration()),
      listArtifactPaths: () => Promise.resolve([DEPENDENT_PATH, specPath]),
      readFile: (path) => Promise.resolve(files.get(path)!),
      writeFile: () => Promise.resolve(),
      stagePaths: () => Promise.resolve(),
      captureIndexState: captureCleanIndex,
    }, { slug: "dependent", metaPath: DEPENDENT_PATH, apply: false });

    expect(result).toMatchObject({
      status: "pending",
      prepared: {
        plan: {
          dependency: { before: [], after: [] },
          trackedReferences: {
            edits: [{
              path: specPath,
              replacements: [{ subject: "origin", targetSlug: "successor" }],
            }],
          },
        },
        edits: [{ path: specPath, content: "See `spec-successor.md`.\n" }],
      },
    });
  });

  it("guards every scanned artifact before writing or staging the bounded batch", async () => {
    const metaContent = meta("Active", []);
    const specPath = ".arc/active/spec-dependent.md";
    const specContent = "See `spec-origin.md`.\n";
    const reads = new Map<string, number>();
    const writes: string[] = [];
    const stages: Array<readonly string[]> = [];
    const result = await runCurrentWuReconcile({
      index,
      queryDisposition: () => Promise.resolve({ status: "absent" }),
      enumerateRetirementRecords: () => Promise.resolve(renameEnumeration()),
      listArtifactPaths: () => Promise.resolve([DEPENDENT_PATH, specPath]),
      readFile: (path) => {
        const count = reads.get(path) ?? 0;
        reads.set(path, count + 1);
        if (path === specPath) {
          return Promise.resolve(count === 0 ? specContent : `${specContent}stale\n`);
        }
        return Promise.resolve(metaContent);
      },
      writeFile: async (path) => { writes.push(path); },
      stagePaths: async (paths) => { stages.push(paths); },
      captureIndexState: captureCleanIndex,
    }, { slug: "dependent", metaPath: DEPENDENT_PATH, apply: true });

    expect(result).toMatchObject({ status: "conflict", reason: "stale-content" });
    expect(writes).toEqual([]);
    expect(stages).toEqual([]);
  });

  it.each(["write", "stage"] as const)(
    "rolls back a partial multi-file %s failure so the exact plan can retry",
    async (failurePoint) => {
      const metaContent = meta("Active", ["origin"]);
      const specPath = ".arc/active/spec-dependent.md";
      const specContent = "See `spec-origin.md`.\n";
      const files = new Map([[DEPENDENT_PATH, metaContent], [specPath, specContent]]);
      let failed = false;
      let writeAttempt = 0;
      const stageCalls: Array<readonly string[]> = [];
      const indexFiles = new Map([[DEPENDENT_PATH, "pre-existing staged content"]]);
      const context = {
        index,
        queryDisposition,
        enumerateRetirementRecords: () => Promise.resolve(renameEnumeration()),
        listArtifactPaths: () => Promise.resolve([DEPENDENT_PATH, specPath]),
        readFile: (path: string) => Promise.resolve(files.get(path)!),
        writeFile: (path: string, content: string) => {
          writeAttempt += 1;
          if (failurePoint === "write" && !failed && writeAttempt === 2) {
            failed = true;
            return Promise.reject(new Error("write failed"));
          }
          files.set(path, content);
          return Promise.resolve();
        },
        stagePaths: (paths: readonly string[]) => {
          if (failurePoint === "stage" && !failed) {
            failed = true;
            indexFiles.set(DEPENDENT_PATH, files.get(DEPENDENT_PATH)!);
            indexFiles.set(specPath, files.get(specPath)!);
            return Promise.reject(new Error("stage failed"));
          }
          stageCalls.push(paths);
          for (const path of paths) indexFiles.set(path, files.get(path)!);
          return Promise.resolve();
        },
        captureIndexState: () => {
          const snapshot = new Map(indexFiles);
          return Promise.resolve(async () => {
            indexFiles.clear();
            for (const [path, content] of snapshot) indexFiles.set(path, content);
          });
        },
      };

      await expect(runCurrentWuReconcile(
        context,
        { slug: "dependent", metaPath: DEPENDENT_PATH, apply: true },
      )).rejects.toThrow(`${failurePoint} failed`);
      expect(files).toEqual(new Map([[DEPENDENT_PATH, metaContent], [specPath, specContent]]));
      expect(indexFiles).toEqual(new Map([[DEPENDENT_PATH, "pre-existing staged content"]]));

      const retried = await runCurrentWuReconcile(
        context,
        { slug: "dependent", metaPath: DEPENDENT_PATH, apply: true },
      );

      expect(retried).toMatchObject({
        status: "applied",
        stagedPaths: [DEPENDENT_PATH, specPath],
      });
      expect(parseMetaRecord(files.get(DEPENDENT_PATH)!)["Depends On"]).toBe("successor");
      expect(files.get(specPath)).toBe("See `spec-successor.md`.\n");
      expect(stageCalls.at(-1)).toEqual([DEPENDENT_PATH, specPath]);
    },
  );

  it("preserves an advisory-only plan when apply has no mechanical edits", async () => {
    const metaContent = meta("Active", []);
    const notesPath = ".arc/active/notes-dependent.md";
    const notesContent = "The origin remains relevant context.\n";
    const files = new Map([[DEPENDENT_PATH, metaContent], [notesPath, notesContent]]);
    const writes: string[] = [];
    const stages: Array<readonly string[]> = [];

    const result = await runCurrentWuReconcile({
      index,
      queryDisposition: () => Promise.resolve({ status: "absent" }),
      enumerateRetirementRecords: () => Promise.resolve(renameEnumeration()),
      listArtifactPaths: () => Promise.resolve([DEPENDENT_PATH, notesPath]),
      readFile: (path) => Promise.resolve(files.get(path)!),
      writeFile: async (path) => { writes.push(path); },
      stagePaths: async (paths) => { stages.push(paths); },
      captureIndexState: captureCleanIndex,
    }, { slug: "dependent", metaPath: DEPENDENT_PATH, apply: true });

    expect(result).toMatchObject({
      status: "pending",
      prepared: { edits: [], plan: { advisories: [expect.objectContaining({ path: notesPath })] } },
    });
    expect(writes).toEqual([]);
    expect(stages).toEqual([]);
  });
});
