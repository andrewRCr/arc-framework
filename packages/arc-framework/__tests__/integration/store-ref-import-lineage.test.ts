/** Imported transitions retain terminal ownership and archive lookup behavior. */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";
import { importFixture } from "../helpers/store/import-fixture.js";
import { IMPORT_TRANSITIONS } from "../helpers/store/import-lineage.js";
import { IMPORT_ARCHIVED_WORK, IMPORT_ARCHIVED_COHORTS } from "../helpers/store/import-archives.js";
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

describe("lineage import in the default layout", () => {
  const layout = "default";
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
  it("imports known former-name chains ending at a terminal origin without a primary", async () => {
    const h = await importComparisonFixture(layout, async (fixture) => {
      for (const [origin, successor] of [["ancient-terminal", "former-terminal"], ["former-terminal", "abandoned"]]) {
        const path = resolveArcPath({ kind: "transition-record", origin: SlugSchema.parse(origin) });
        const record = LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: origin }, kind: "rename",
          successors: [{ name: successor }], incoming: [] });
        await writeFile(join(fixture.root, path), writeLineageRecord(record));
        await fixture.git("git", ["add", path]);
      }
      await fixture.git("git", ["commit", "-m", "Seed rename chain ending in terminal origin"]);
    }, { completed: true, lineage: true });
    const migrated = await h.target.migrate();
    expect(migrated).toMatchObject({ status: "ok" });
    if (migrated.status !== "ok") throw new Error("Known terminal rename chain was not imported");
    expect(migrated.result.notices.some(({ condition }) => condition.includes("rename"))).toBe(false);
    const terminal = success(await h.store.read({ reference: ref("lineage/transition", "abandoned") }));
    for (const name of ["ancient-terminal", "former-terminal"]) {
      expect(success(await h.store.lookup({ kind: "lineage", origin: SlugSchema.parse(name) })).reference).toEqual(terminal.reference);
      expect(await h.store.read({ reference: ref("lineage/transition", name) })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      expect(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse(name) })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    }
    h.comparators.set("lineage/transition", importedLineageComparator(h.store, h.sourceStore));
    expect(await h.compare()).toEqual([]);
    const changedPath = resolveArcPath({ kind: "transition-record", origin: SlugSchema.parse("former-terminal") });
    const changed = LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: "former-terminal" }, kind: "rename",
      successors: [{ name: "cut-origin" }], incoming: [] });
    await writeFile(join(h.source.root, changedPath), writeLineageRecord(changed));
    await h.source.git("git", ["add", changedPath]);
    await h.source.git("git", ["commit", "-m", "Alter independent source rename destination"]);
    expect(await h.compare()).toEqual(expect.arrayContaining([expect.objectContaining({ field: "content",
      reference: expect.objectContaining({ owner: expect.objectContaining({ name: "ancient-terminal" }) }) })]));
  });
  it("pulls completed and terminal origins into a second clone without pending ends on repeated pulls", async () => {
    const h = await importFixture(layout, { completed: true, lineage: true });
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    expect(success(await createRefStore(h.ports).push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    const tips = async (run: (args: string[]) => Promise<{ stdout: string }>, prefix: string) =>
      (await run(["for-each-ref", "--format=%(refname) %(objectname)", prefix])).stdout;
    const importer = (args: string[]) => h.git("git", args), remote = (args: string[]) => h.remote("git", args);
    const imported = { history: await tips(importer, "refs/arc/history/"), archive: await tips(importer, "refs/arc/archive/") };
    expect(await tips(remote, "refs/arc/history/")).toBe(imported.history);
    expect(await tips(remote, "refs/arc/archive/")).toBe(imported.archive);
    const second = await importFixture(layout);
    await second.git("git", ["remote", "set-url", "origin", h.origin]);
    const peer = await createRefSyncCheckout(second.root, layout, h.origin);
    const histories = imported.history.split("\n").filter(Boolean).map((line) => HistoryRefSchema.parse(line.split(" ")[0]));
    expect(histories).toHaveLength(7);
    for (let attempt = 0; attempt < 3; attempt++) {
      const pull = success(await peer.store.pull({ history: histories }));
      expect(pull.pulls.length).toBeGreaterThan(0);
      expect(pull.pulls.every(({ status }) => status !== "failed")).toBe(true);
      expect(pull.pulls.flatMap(({ notices }) => notices).some(({ kind }) => kind === "end-pending")).toBe(false);
      expect(await tips(peer.git, "refs/arc/history/")).toBe(imported.history);
      expect(await tips(peer.git, "refs/arc/archive/")).toBe(imported.archive);
      for (const { name, sequence } of IMPORT_ARCHIVED_WORK) expect(success(await peer.store.read({ reference: ref("work-item/meta", name) })).placement)
        .toEqual({ kind: "completed", quarter: "2026-q3", sequence });
      for (const { name, sequence, closeout } of IMPORT_ARCHIVED_COHORTS) expect(success(await peer.store.read({ reference:
        RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name } }) })).placement)
        .toEqual({ kind: "completed", quarter: "2026-q3", sequence, closeout });
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
    const uid = original.reference.owner.type === "work-item" ? original.reference.owner.uid : "";
    const path = `53_archived/metadata-${uid}.json`;
    const metadata = JSON.parse((await h.git("git", ["show", `refs/arc/archive/2026-q3:${path}`])).stdout);
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
    const uid = cohort.reference.owner.type === "cohort" ? cohort.reference.owner.uid : "";
    expect((await h.git("git", ["show", `refs/arc/history/cohort/${uid}:cohort-closed-a.md`])).stdout).toContain("Late cohort correction.");
  });
  it("retains each terminal origin as one empty history commit and reports missing records", async () => {
    const h = await importFixture(layout, { completed: true, lineage: true });
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const store = createRefStore(h.ports);
    for (const name of ["cut-origin", "abandoned"]) {
      const transition = success(await store.read({ reference: ref("lineage/transition", name) }));
      const owner = transition.reference.owner;
      const history = `refs/arc/history/work/${owner.type === "work-item" ? owner.uid : ""}`;
      expect((await h.git("git", ["rev-list", "--count", history])).stdout).toBe("1");
      expect((await h.git("git", ["show", "-s", "--format=%P", history])).stdout).toBe("");
      expect((await h.git("git", ["ls-tree", "-r", "--name-only", history])).stdout).toBe("");
      expect((await h.git("git", ["show", "-s", "--format=%B", history])).stdout).toMatch(/Arc-Lifecycle-Action: import/u);
      expect(await store.history({ reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner }) })).toMatchObject({
        status: "refused", refusal: { code: "not-found" },
      });
    }
  });
});

it("refuses unresolved and cyclic rename chains, then imports them after source repair", async () => {
  const h = await importFixture("default", { completed: true, lineage: true });
  const edges = [["unknown-terminal", "missing-terminal"], ["cycle-left", "cycle-right"], ["cycle-right", "cycle-left"]] as const;
  const writeEdges = async (repaired: boolean) => {
    for (const [origin, successor] of edges) {
      const path = resolveArcPath({ kind: "transition-record", origin: SlugSchema.parse(origin) });
      const record = LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: origin }, kind: "rename",
        successors: [{ name: repaired ? "abandoned" : successor }], incoming: [] });
      await writeFile(join(h.root, path), writeLineageRecord(record));
      await h.git("git", ["add", path]);
    }
    await h.git("git", ["commit", "-m", repaired ? "Repair terminal rename chains" : "Seed unresolved terminal rename chains"]);
  };
  await writeEdges(false);
  const refused = await h.migrate();
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  if (refused.status !== "refused" || refused.refusal.code !== "import-refused") throw new Error("Expected a source-repair refusal");
  const store = createRefStore(h.ports);
  for (const [origin] of edges) {
    expect(refused.refusal.report.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining(origin),
      remedy: { text: expect.stringContaining("retry") } }));
    expect(await store.lookup({ kind: "lineage", origin: SlugSchema.parse(origin) })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/project/registry"])).stdout).toBe("");
  await writeEdges(true);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const terminal = success(await store.read({ reference: ref("lineage/transition", "abandoned") }));
  for (const [origin] of edges) expect(success(await store.lookup({ kind: "lineage", origin: SlugSchema.parse(origin) })).reference).toEqual(terminal.reference);
});
