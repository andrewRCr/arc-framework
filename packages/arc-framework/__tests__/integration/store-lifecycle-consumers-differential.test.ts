/** Read-only lifecycle consumers retain their exact query fields across identity storage. */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lifecycleRepository, entries, metaPath, metaReference } from "../helpers/store/lifecycle-differential.js";
import { candidateFixture } from "../helpers/store/tracked-write-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { listLifecycleIndex } from "../../src/lib/store/lifecycle-index.js";
import { createStoreLifecycleStorage } from "../../src/lib/store/lifecycle-storage.js";
import { resolveSlugQuery } from "../../src/lib/work-unit/lifecycle-query.js";
import { deriveState } from "../../src/lib/work-unit/lifecycle-resolver.js";
import { parseMetaRecord } from "../../src/lib/active/meta-reader.js";
import { resolveExplicitViewTarget } from "../../src/handlers/view.js";
import { resolveTaskListPath } from "../../src/commands/active/status.js";
import { branchToWorkUnitSlug } from "../../src/lib/work-unit/completed-index.js";
import { createGitTreeReadFs } from "../../src/scripts/review-gate/hosts/local/git-tree-fs.js";
import { readLifecycleSummary } from "../../src/scripts/integration/checkpoint-composition.js";
import type { LifecycleIndex } from "../../src/lib/work-unit/lifecycle-index.js";
import type { LifecycleEntry } from "../../src/lib/store/lifecycle-index.js";

function queryIndex(values: readonly LifecycleEntry[]): LifecycleIndex {
  return new Map(values.map((entry) => [entry.reference.owner.name, { slug: entry.reference.owner.name,
    phase: entry.phase, location: entry.location, cohort: entry.fields.cohort, dependsOn: entry.fields.dependsOn, path: metaPath(entry) }]));
}

describe("lifecycle consumer query differentials", () => {
  it("status slug query preserves state, dependency landing and operational authority", async () => {
    const h = await lifecycleRepository();
    for (const name of ["origin", "private", "parked", "disagree", "completed", "missing"]) {
      const old = resolveSlugQuery(h.composedLegacy.index, name);
      const entry = h.get(name, "selected");
      expect(resolveSlugQuery(queryIndex(h.selected), name)).toEqual(old);
      expect(entry ? { phase: entry.phase, location: entry.location } : null).toEqual(old.position);
      expect(deriveState(entry ? { phase: entry.phase, location: entry.location } : null)).toBe(old.state);
      expect(await h.agreement(name)).toBe(h.composedLegacy.recordsBySlug.get(name)?.writablePath !== undefined);
      expect(entry?.fields).toEqual(await h.oldFields(name, "selected"));
    }
    expect(resolveSlugQuery(queryIndex(h.selected), "origin").dependsOn).toEqual([
      { slug: "completed", landed: true }, { slug: "private", landed: false }, { slug: "missing", landed: false },
    ]);
    expect(h.composedLegacy.worktreePathBySlug.get("parked")).toBeUndefined();
    expect(await h.agreement("parked")).toBe(true);
    expect(await h.agreement("private")).toBe(false);
  });
  it("reconcile preserves checkout-branch filtering and explicit archived fallback", async () => {
    const h = await lifecycleRepository();
    for (const branch of ["main", "feat/parked", "feat/completed", "feat/absent"]) {
      const oldMatches = [];
      for (const old of h.heldLegacy.values()) if ((await h.oldFields(old.slug))?.branch === branch) oldMatches.push({ slug: old.slug, metaPath: old.path });
      expect(h.held.filter((entry) => entry.fields.branch === branch).map((entry) => ({ slug: entry.reference.owner.name, metaPath: metaPath(entry) }))).toEqual(oldMatches);
    }
    const requested = "fallback", branch = "feat/fallback", old = h.heldLegacy.get(requested), entry = h.get(requested);
    expect(h.held.some((row) => row.fields.branch === branch)).toBe(false);
    expect(branchToWorkUnitSlug(branch)).toBe(requested);
    expect(entry ? { phase: entry.phase, location: entry.location, taskList: entry.fields.taskList, metaPath: metaPath(entry) } : null)
      .toEqual(old ? { phase: old.phase, location: old.location, taskList: (await h.oldFields(requested))?.taskList, metaPath: old.path } : null);
    expect(entry?.phase).toBe("Shipped"); expect(entry?.location).toBe("completed");
  });
  it("view explicit target preserves existence, cohort placement and task binding", async () => {
    const h = await lifecycleRepository();
    for (const name of ["origin", "planned", "provisional", "completed", "missing"]) {
      const old = await resolveExplicitViewTarget({ cwd: h.root, slug: name, index: h.heldLegacy, readFile: h.fs.readFile });
      const entry = h.get(name);
      expect(entry?.location).toBe(h.heldLegacy.get(name)?.location);
      if (old.status === "resolved") {
        if (!entry) throw new Error("Identity view target missing");
        expect(entry.fields).toEqual(parseMetaRecord(await h.fs.readFile(join(h.root, old.metaPath))));
        expect(metaPath(entry)).toBe(old.metaPath);
        expect(resolveTaskListPath(metaPath(entry), entry.fields.taskList)).toBe(old.taskListPath);
        expect(entry.placement.kind).toBe(old.placement.kind);
        if (entry.placement.kind === "backlog") expect(entry.fields.cohort?.split("/")).toEqual(old.placement.kind === "backlog" ? old.placement.cohort : []);
      } else if (old.status === "completed") expect(entry?.location).toBe("completed");
      else expect(entry).toBeUndefined();
    }
  });
  it("teardown competing projection preserves branch and retirement-location evidence", async () => {
    const h = await lifecycleRepository();
    for (const [branch, expectedLocation, sameCheckout] of [
      ["feat/parked", "planned", false], ["feat/parked", "planned", true], ["feat/completed", "completed", false],
      ["feat/disagree", "planned", false], ["feat/private", "planned", false], ["main", "planned", false],
    ] as const) {
      const slug = branchToWorkUnitSlug(branch), old = slug === null ? undefined : h.heldLegacy.get(slug), entry = slug === null ? undefined : h.get(slug);
      const fields = slug === null ? undefined : await h.oldFields(slug);
      expect(entry ? { location: entry.location, branch: entry.fields.branch } : null).toEqual(old ? { location: old.location, branch: fields?.branch } : null);
      const legacyCompetes = old !== undefined && fields?.branch === branch && (old.location !== expectedLocation || !sameCheckout);
      const identityCompetes = entry !== undefined && entry.fields.branch === branch && (entry.location !== expectedLocation || !sameCheckout);
      expect(identityCompetes).toBe(legacyCompetes);
      if (branch === "feat/completed" && !sameCheckout) expect(identityCompetes).toBe(true);
      if (branch === "feat/private") expect(identityCompetes).toBe(false);
    }
  });
  it("checkpoint lifecycle summary pins both archive cadences and artifact facts to HEAD", async () => {
    const h = await lifecycleRepository();
    const oldFs = createGitTreeReadFs({ cwd: h.root, revision: h.head, exec: h.exec });
    const snapshot = await createStoreLifecycleStorage({ store: h.store, checkoutRoot: h.root }).readSnapshot();
    expect(snapshot.version).toBe(h.head);
    await h.put(".arc/completed/2026-q4/01_completed/meta-completed.md", "later working edit");
    await h.put(".arc/backlog/planned/group/integrating/meta-integrating.md", "later integrating edit");
    const savedEntries = entries(success(await listLifecycleIndex(h.store, { asOf: h.head })));
    for (const name of ["completed", "finalizing", "integrating", "origin", "missing"]) for (const cadence of ["with-integration", "manual"] as const) {
      const old = await readLifecycleSummary(h.root, name, cadence, h.head, oldFs);
      const current = await readLifecycleSummary(h.root, name, cadence, snapshot.version, snapshot.fs);
      expect(current).toEqual(old);
      if (name === "completed" && cadence === "with-integration") expect(current.complete).toBe(true);
      if (name === "finalizing" && cadence === "manual") expect(current.complete).toBe(true);
      if (name === "origin") expect(current.artifactFacts).toEqual(expect.arrayContaining([expect.objectContaining({ code: "missing-completion-notes" })]));
      const saved = savedEntries.find((entry) => entry.reference.owner.name === name);
      expect(saved ? { phase: saved.phase, location: saved.location } : null).toEqual(old.position);
      if (saved) expect(saved.fields).toEqual(parseMetaRecord(await oldFs.readFile(join(h.root, metaPath(saved)))));
    }
  });
  it("shipped delivery renewal reads the committed meta and task-list binding", async () => {
    const h = await lifecycleRepository();
    const oldFs = createGitTreeReadFs({ cwd: h.root, revision: h.head, exec: h.exec });
    await h.put(".arc/completed/2026-q4/01_completed/meta-completed.md", "working edit has no task binding");
    const saved = entries(success(await listLifecycleIndex(h.store, { asOf: h.head })));
    for (const name of ["completed", "fallback", "missing"]) {
      const old = h.heldLegacy.get(name), entry = saved.find((row) => row.reference.owner.name === name);
      expect(entry?.location).toBe(old?.location);
      const fields = old ? parseMetaRecord(await oldFs.readFile(join(h.root, old.path))) : undefined;
      expect(entry?.fields.taskList).toBe(fields?.taskList);
      if (entry && old) {
        const record = success(await h.store.read({ reference: metaReference(name), asOf: h.head }));
        expect(record.content.trimEnd()).toBe(await oldFs.readFile(join(h.root, old.path)));
        expect(resolveTaskListPath(metaPath(entry), entry.fields.taskList)).toBe(resolveTaskListPath(old.path, fields?.taskList ?? null));
      }
    }
    expect(saved.find((entry) => entry.reference.owner.name === "completed")?.fields.taskList).toBe("tasks-completed.md");
  });
  it("completed review-fix locus preserves candidate owner and task-list binding", async () => {
    const h = await lifecycleRepository();
    for (const owner of [candidateFixture("completed").attestation.workUnit, candidateFixture("origin").attestation.workUnit, "missing"]) {
      const old = h.heldLegacy.get(owner), entry = h.get(owner);
      expect(entry?.location === "completed").toBe(old?.location === "completed");
      if (old?.location === "completed") {
        expect(entry).toBeDefined();
        const fields = await h.oldFields(owner);
        expect(entry?.fields.taskList).toBe(fields?.taskList);
        if (!entry) throw new Error("Archived review-fix record missing");
        expect(resolveTaskListPath(metaPath(entry), entry.fields.taskList)).toBe(resolveTaskListPath(old.path, fields?.taskList ?? null));
        expect(entry.reference.owner.name).toBe(owner);
      }
    }
  });
});
