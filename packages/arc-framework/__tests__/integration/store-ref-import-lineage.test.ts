/** Imported transitions retain terminal ownership and archive lookup behavior. */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { LineageRecordSchema, type WorkItemRef } from "../../src/lib/store/kinds/lineage/index.js";
import { importFixture } from "../helpers/store/import-fixture.js";
import { IMPORT_TRANSITIONS } from "../helpers/store/import-lineage.js";
import { success } from "../helpers/store/suite-tools.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { importComparisonFixture } from "../helpers/store/import-comparison.js";
import { importedLineageComparator } from "../helpers/store/import-lineage-comparison.js";
import { createRefSyncCheckout } from "../helpers/store/ref-sync.js";
import { HistoryRefSchema } from "../../src/lib/store/refusal.js";
import { writeFile } from "node:fs/promises";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";

const ref = (kind: "lineage/transition" | "work-item/meta", name: string) => RecordReferenceSchema.parse({ kind, owner: { type: "work-item", name } });

describe.each(["default", "separate"] as const)("lineage import in %s", (layout) => {
  it("compares terminal records and former slugs with only their documented transition transforms", async () => {
    const h = await importComparisonFixture(layout, undefined, { completed: true, lineage: true });
    expect(await h.target.migrate()).toMatchObject({ status: "ok" });
    const unnormalized = await h.compare();
    expect(unnormalized.some(({ reference }) => reference.kind === "lineage/transition")).toBe(true);
    h.comparators.set("lineage/transition", importedLineageComparator(h.store));
    expect(await h.compare()).toEqual([]);
    const changed = LineageRecordSchema.parse(IMPORT_TRANSITIONS.find(({ origin }) => origin.name === "cut-origin"));
    changed.successors = [];
    changed.kind = "abandon";
    changed.incoming = [];
    delete changed.outgoing;
    const path = resolveArcPath({ kind: "transition-record", origin: SlugSchema.parse("cut-origin") });
    await writeFile(join(h.source.root, path), writeLineageRecord(changed));
    await h.source.git("git", ["add", path]);
    await h.source.git("git", ["commit", "-m", "Alter comparison source terminal semantics"]);
    expect(await h.compare()).toEqual(expect.arrayContaining([expect.objectContaining({ reference: expect.objectContaining({ kind: "lineage/transition" }), field: "content" })]));
  });
  it("pulls completed and terminal origins into a second clone without pending ends on repeated pulls", async () => {
    const h = await importFixture(layout, { completed: true, lineage: true });
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const scope = layout === "separate" ? [`--git-dir=${join(h.root, ".git/arc/store")}`] : [];
    if (layout === "separate") {
      await h.git("git", [...scope, "remote", "add", "backing", h.origin]);
      await h.git("git", [...scope, "config", "remote.backing.arc-state", "push"]);
    }
    expect(success(await createRefStore(h.ports).push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    const second = await importFixture(layout);
    await second.git("git", ["remote", "set-url", "origin", h.origin]);
    const peer = await createRefSyncCheckout(second.root, layout, h.origin);
    const histories = (await h.git("git", [...scope, "for-each-ref", "--format=%(refname)", "refs/arc/history/"])).stdout.split("\n").filter(Boolean).map((value) => HistoryRefSchema.parse(value));
    expect(histories).toHaveLength(7);
    for (let attempt = 0; attempt < 3; attempt++) {
      const pull = success(await peer.store.pull({ history: histories }));
      expect(pull.pulls.length).toBeGreaterThan(0);
      expect(pull.pulls.every(({ status }) => status !== "failed")).toBe(true);
      expect(pull.pulls.flatMap(({ notices }) => notices).some(({ kind }) => kind === "end-pending")).toBe(false);
      expect(success(await peer.store.read({ reference: ref("work-item/meta", "archived") })).placement).toMatchObject({ kind: "completed", sequence: "53" });
      const origin = success(await peer.store.read({ reference: ref("lineage/transition", "cut-origin") }));
      expect(await peer.store.history({ reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: origin.reference.owner }) })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    }
  });
  it("resolves a decomposed origin's slug through its terminal lineage", async () => {
    const h = await importFixture(layout, { completed: true, lineage: true });
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const store = createRefStore(h.ports);
    const record = success(await store.read({ reference: ref("lineage/transition", "cut-origin") }));
    expect(success(await store.lookup({ kind: "lineage", origin: SlugSchema.parse("cut-origin") })).reference).toEqual(record.reference);
    expect(await store.lookup({ kind: "slug", slug: SlugSchema.parse("cut-origin") })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
  it("keeps a rename only as its archived successor's former slug", async () => {
    const h = await importFixture(layout, { completed: true, lineage: true });
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const store = createRefStore(h.ports);
    const original = success(await store.read({ reference: ref("work-item/meta", "archived") }));
    expect(success(await store.lookup({ kind: "slug", slug: SlugSchema.parse("old-archived") })).reference).toEqual(original.reference);
    expect(await store.read({ reference: ref("lineage/transition", "old-archived") })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const scope = layout === "separate" ? [`--git-dir=${join(h.root, ".git/arc/store")}`] : [];
    const uid = original.reference.owner.type === "work-item" ? original.reference.owner.uid : "";
    const path = `53_archived/metadata-${uid}.json`;
    const metadata = JSON.parse((await h.git("git", [...scope, "show", `refs/arc/archive/2026-q3:${path}`])).stdout);
    expect(metadata.formerSlugs).toEqual(["old-archived"]);
    const lineage = success(await store.list({ family: "lineage", kind: "lineage/transition" }));
    expect(lineage.status).toBe("complete");
    if (lineage.status === "complete") expect(lineage.records.map(({ reference }) => reference.owner.name).sort()).toEqual(["abandoned", "cut-origin"]);
  });
  it("reopens imported completed work and writes a closed cohort on its history ref", async () => {
    const h = await importFixture(layout, { completed: true, lineage: true });
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const store = createRefStore(h.ports);
    const prior = success(await store.read({ reference: ref("work-item/meta", "archived") }));
    success(await store.write({ action: "put", reference: prior.reference, expected: prior.version,
      content: makeMetaFixture("archived", { owner: "andrew", branch: "feat/archived" }), placement: { kind: "active" },
      provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
    const opened = success(await store.read({ reference: prior.reference }));
    success(await store.write({ action: "put", reference: opened.reference, expected: opened.version,
      content: opened.content + "\nReopened source can be edited.\n", placement: { kind: "active" }, provenance: { verb: "edit", lifecycleAction: "edit" } }));
    expect(success(await store.read({ reference: prior.reference }))).toMatchObject({ placement: { kind: "active" }, content: expect.stringContaining("Reopened source can be edited.") });
    const cohort = success(await store.read({ reference: RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: "closed-a" } }) }));
    success(await store.write({ action: "put", reference: cohort.reference, expected: cohort.version, content: cohort.content + "\nLate cohort correction.\n",
      provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const history = success(await store.history({ reference: cohort.reference }));
    expect(history[0]?.content).toContain("Late cohort correction.");
    const scope = layout === "separate" ? [`--git-dir=${join(h.root, ".git/arc/store")}`] : [];
    const uid = cohort.reference.owner.type === "cohort" ? cohort.reference.owner.uid : "";
    expect((await h.git("git", [...scope, "show", `refs/arc/history/cohort/${uid}:cohort-closed-a.md`])).stdout).toContain("Late cohort correction.");
  });
  it("retains each terminal origin as one empty history commit and reports missing records", async () => {
    const h = await importFixture(layout, { completed: true, lineage: true });
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const store = createRefStore(h.ports);
    const scope = layout === "separate" ? [`--git-dir=${join(h.root, ".git/arc/store")}`] : [];
    for (const name of ["cut-origin", "abandoned"]) {
      const transition = success(await store.read({ reference: ref("lineage/transition", name) }));
      const owner = transition.reference.owner;
      const history = `refs/arc/history/work/${owner.type === "work-item" ? owner.uid : ""}`;
      expect((await h.git("git", [...scope, "rev-list", "--count", history])).stdout).toBe("1");
      expect((await h.git("git", [...scope, "show", "-s", "--format=%P", history])).stdout).toBe("");
      expect((await h.git("git", [...scope, "ls-tree", "-r", "--name-only", history])).stdout).toBe("");
      expect((await h.git("git", [...scope, "show", "-s", "--format=%B", history])).stdout).toMatch(/Arc-Lifecycle-Action: import/u);
      expect(await store.history({ reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner }) })).toMatchObject({
        status: "refused", refusal: { code: "not-found" },
      });
    }
  });
  it("keys terminal origins and every held cross-reference by the imported owner's UID", async () => {
    const h = await importFixture(layout, { completed: true, lineage: true });
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const store = createRefStore(h.ports);
    const scope = layout === "separate" ? [`--git-dir=${join(h.root, ".git/arc/store")}`] : [];
    for (const original of IMPORT_TRANSITIONS.filter(({ kind }) => kind !== "rename")) {
      const record = success(await store.read({ reference: ref("lineage/transition", original.origin.name) }));
      const fields = LineageRecordSchema.parse(JSON.parse(record.content));
      expect(fields.origin).toEqual(record.reference.owner.type === "work-item"
        ? { name: record.reference.owner.name, uid: record.reference.owner.uid } : undefined);
      expect(fields.origin.uid).toMatch(/^[0-9a-f-]{36}$/u);
      const mapped = async (value: WorkItemRef): Promise<WorkItemRef> => {
        if (value.name === "unheld") return value;
        const primary = success(await store.read({ reference: ref("work-item/meta", value.name) }));
        return { name: value.name, uid: primary.reference.owner.type === "work-item" ? primary.reference.owner.uid : undefined };
      };
      expect(fields.successors).toEqual(await Promise.all(original.successors.map(mapped)));
      for (const [index, entry] of (original.incoming ?? []).entries()) {
        expect(fields.incoming[index]?.dependent).toEqual(await mapped(entry.dependent));
        if (entry.disposition.kind === "replace") expect(fields.incoming[index]?.disposition).toEqual({ kind: "replace",
          replacementTargets: await Promise.all(entry.disposition.replacementTargets.map(mapped)) });
      }
      for (const [index, entry] of (original.outgoing ?? []).entries()) expect(fields.outgoing?.[index]).toEqual({
        prerequisite: await mapped(entry.prerequisite), members: await Promise.all(entry.members.map(mapped)),
      });
      expect((await h.git("git", [...scope, "ls-tree", "-r", "--name-only", "refs/arc/project/registry"])).stdout).toContain(`lineage/${fields.origin.uid}.json`);
      const metadata = JSON.parse((await h.git("git", [...scope, "show", "refs/arc/project/registry:metadata-registry.json"])).stdout);
      expect(metadata.lineage[fields.origin.uid!]).toBe(original.origin.name);
    }
  });
});
