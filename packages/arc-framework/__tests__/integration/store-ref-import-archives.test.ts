/** Imported archives retain their legacy coordinates and complete item histories. */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { importFixture } from "../helpers/store/import-fixture.js";
import { IMPORT_ARCHIVED_WORK, IMPORT_ARCHIVED_COHORTS } from "../helpers/store/import-archives.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { importComparisonFixture } from "../helpers/store/import-comparison.js";

describe.each(["default", "separate"] as const)("archive import in %s", (layout) => {
  it("compares every completed record against an independent source with no added allowance", async () => {
    const h = await importComparisonFixture(layout, undefined, { completed: true });
    expect(await h.target.migrate()).toMatchObject({ status: "ok" });
    expect(h.comparators.size).toBe(0);
    expect(await h.compare()).toEqual([]);
  });
  it("gives each replay its own batch and pairs every ended folder with its history landing", async () => {
    const h = await importFixture(layout, { completed: true });
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const scope = layout === "separate" ? [`--git-dir=${join(h.root, ".git/arc/store")}`] : [];
    const git = async (...args: string[]) => (await h.git("git", [...scope, ...args])).stdout;
    const paths = (await git("ls-tree", "-r", "--name-only", "refs/arc/archive/2026-q3")).split("\n")
      .filter((path) => /\/metadata-[0-9a-f-]+\.json$/u.test(path));
    expect(paths).toHaveLength(5);
    const landingBatch = /^Arc-Batch: (.+)$/mu.exec(await git("show", "-s", "--format=%B", "refs/arc/archive/2026-q3"))?.[1];
    expect(landingBatch).toBeTruthy();
    for (const path of paths) {
      const metadata = JSON.parse(await git("show", `refs/arc/archive/2026-q3:${path}`));
      expect(metadata.endBatch).toBe(landingBatch);
      expect(metadata.batch).toBe(landingBatch);
      const uid = /metadata-(.+)\.json$/u.exec(path)![1];
      const history = `refs/arc/history/${path.includes("_cohort-") ? "cohort" : "work"}/${uid}`;
      const batches = [...(await git("log", "--format=%B", history)).matchAll(/^Arc-Batch: (.+)$/gmu)].map((match) => match[1]);
      expect(batches[0]).toBe(landingBatch);
      expect(new Set(batches).size).toBe(batches.length);
      if (metadata.slug === "archived") expect(batches).toHaveLength(4);
    }
    if (layout === "separate") {
      await git("remote", "add", "backing", h.origin);
      await git("config", "remote.backing.arc-state", "push");
    }
    const store = createRefStore(h.ports);
    const pushed = success(await store.push());
    expect(pushed.publishes.length).toBeGreaterThan(0);
    expect(pushed.publishes.every(({ status }) => status !== "failed")).toBe(true);
    const pulled = success(await store.pull());
    expect(pulled.pulls.length).toBeGreaterThan(0);
    expect(pulled.pulls.every(({ status }) => status !== "failed")).toBe(true);
    expect([...pushed.pulls, ...pulled.pulls].flatMap(({ notices }) => notices).some(({ kind }) => kind === "end-pending")).toBe(false);
  });
  it("preserves duplicate source numbers and their gap, with the next archive after the highest", async () => {
    const h = await importFixture(layout, { completed: true });
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const store = createRefStore(h.ports);
    const scope = layout === "separate" ? [`--git-dir=${join(h.root, ".git/arc/store")}`] : [];
    for (const { name, sequence } of IMPORT_ARCHIVED_WORK) {
      const record = success(await store.read({ reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }) }));
      expect(record.placement).toEqual({ kind: "completed", quarter: "2026-q3", sequence });
      const uid = "uid" in record.reference.owner ? record.reference.owner.uid : undefined;
      expect((await h.git("git", [...scope, "show-ref", "--verify", `refs/arc/history/work/${uid}`])).stdout).toContain(`refs/arc/history/work/${uid}`);
      expect((await h.git("git", [...scope, "for-each-ref", "--format=%(refname)", `refs/arc/work/${uid}`])).stdout).toBe("");
    }
    const paths = (await h.git("git", [...scope, "ls-tree", "--name-only", "refs/arc/archive/2026-q3"])).stdout.split("\n").filter(Boolean).sort();
    expect(paths.filter((path) => !/^[0-9]+[ab]_cohort-/u.test(path))).toEqual(["53_also-archived", "53_archived", "55_last-archived"]);
    const fresh = success(await store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "next-archive" } }),
      content: makeMetaFixture("next-archive", { owner: "andrew" }), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
    success(await store.write({ action: "put", reference: fresh.reference, expected: fresh.version!,
      content: makeMetaFixture("next-archive", { state: "Shipped", owner: "andrew", branch: null, completed: "2026-10-01", prUrl: "https://example.test/pull/2" }),
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    expect(success(await store.read({ reference: fresh.reference })).placement).toEqual({ kind: "completed", quarter: "2026-q3", sequence: "56" });
  });
  it("retains each closed cohort's number and closeout letter", async () => {
    const h = await importFixture(layout, { completed: true });
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const store = createRefStore(h.ports);
    const scope = layout === "separate" ? [`--git-dir=${join(h.root, ".git/arc/store")}`] : [];
    for (const { name, sequence, closeout } of IMPORT_ARCHIVED_COHORTS) {
      const record = success(await store.read({ reference: RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name } }) }));
      expect(record.placement).toEqual({ kind: "completed", quarter: "2026-q3", sequence, closeout });
      expect(record.content).toBe(`# Cohort: \`${name}\`\n\n**Purpose:** Preserve the closed cohort.\n`);
      const uid = "uid" in record.reference.owner ? record.reference.owner.uid : undefined;
      expect((await h.git("git", [...scope, "show-ref", "--verify", `refs/arc/history/cohort/${uid}`])).stdout).toContain(`refs/arc/history/cohort/${uid}`);
      const path = `${sequence}${closeout}_cohort-${name}/cohort-${name}.md`;
      const bytes = (await h.ports.rawExec([...scope, "show", `refs/arc/archive/2026-q3:${path}`])).stdout;
      expect(new TextDecoder().decode(bytes)).toBe(record.content);
    }
  });
});
