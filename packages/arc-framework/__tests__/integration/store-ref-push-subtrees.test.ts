import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { RecordReferenceSchema, type PushResult } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";

const provenance = { verb: "user", lifecycleAction: "save" };
const status = (result: PushResult, family: "review" | "lineage") => result.publishes.find((outcome) => outcome.families.includes(family))?.status;

async function seedSubtrees(layout: "default" | "separate") {
  const h = await refSyncFixture(layout);
  const requested = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } });
  const primary = success(await h.a.store.write({ action: "put", reference: requested, expected: null,
    content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance }));
  const review = RecordReferenceSchema.parse({ kind: "review/evidence", key: "test", owner: primary.reference.owner });
  success(await h.a.store.write({ action: "put", reference: review, expected: null, content: "{}", provenance }));
  const counter = RecordReferenceSchema.parse({ kind: "project-registry/counter", key: "serial", owner: { type: "project", name: "project" } });
  success(await h.a.store.write({ action: "put", reference: counter, expected: null, content: "{}", provenance }));
  const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: primary.reference.owner });
  const owner = primary.reference.owner;
  if (owner.type !== "work-item") throw new Error("Expected a work item");
  success(await h.a.store.write({ action: "put", reference: lineage, expected: null,
    content: writeLineageRecord({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid }, kind: "abandon", successors: [], incoming: [] }),
    provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
  return { ...h, primary, review, lineage, counter };
}

describe.each(["default", "separate"] as const)("subtree publication outcomes in the %s layout", (layout) => {
  it("counts review and lineage record movement while ignoring unrelated root metadata and records", async () => {
    const h = await seedSubtrees(layout);
    const first = success(await h.a.store.push());
    expect(status(first, "review")).toBe("pushed"); expect(status(first, "lineage")).toBe("pushed");
    const imported = success(await h.b.store.push());
    expect(status(imported, "review")).toBe("reconciled"); expect(status(imported, "lineage")).toBe("reconciled");
    const primary = success(await h.a.store.read({ reference: h.primary.reference }));
    const counter = success(await h.a.store.read({ reference: h.counter }));
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: primary.reference, expected: primary.version, placement: primary.placement, content: `${primary.content}\nRoot edit.\n` },
      { action: "put", reference: counter.reference, expected: counter.version, content: '{"value":1}' },
    ], provenance }));
    const rootOnly = success(await h.a.store.push());
    expect(status(rootOnly, "review")).toBe("noop"); expect(status(rootOnly, "lineage")).toBe("noop");
    const rootPull = success(await h.b.store.push());
    expect(status(rootPull, "review")).toBe("noop"); expect(status(rootPull, "lineage")).toBe("noop");
  });

  it("counts a subtree record's format-only movement in shared root metadata", async () => {
    const h = await seedSubtrees(layout);
    success(await h.a.store.push()); success(await h.b.store.pull());
    for (const reference of [h.review, h.lineage]) {
      const home = expandStoredPath(reference);
      const parent = (await h.a.git(["rev-parse", home.ref])).stdout;
      const metadata = JSON.parse((await h.a.git(["show", `${home.ref}:${home.metadataPath}`])).stdout) as { formats: Record<string, number> };
      const coordinate = Object.keys(metadata.formats).find((key) => (JSON.parse(key) as { kind: string }).kind === reference.kind);
      if (!coordinate) throw new Error("Expected the stored format coordinate");
      metadata.formats[coordinate] = 2;
      const rows = (await h.a.git(["ls-tree", "-r", "--format=%(objectname) %(path)", home.ref])).stdout.split("\n").filter(Boolean);
      const entries: PlantTreeEntry[] = rows.map((row) => {
        const at = row.indexOf(" "), path = row.slice(at + 1);
        return path === home.metadataPath ? { path, content: canonicalize(metadata) } : { path, oid: row.slice(0, at), mode: "100644" };
      });
      await plantRef(h.a.root, home.ref, entries, { parents: [parent], gitDir: h.a.gitDir });
    }
    const published = success(await h.a.store.push());
    expect(status(published, "review")).toBe("pushed"); expect(status(published, "lineage")).toBe("pushed");
    const imported = success(await h.b.store.push());
    expect(status(imported, "review")).toBe("reconciled"); expect(status(imported, "lineage")).toBe("reconciled");
  });
  it("attributes a quarter-only pull to its archived work, cohort, and review records", async () => {
    const h = await refSyncFixture(layout), quarter = ArchiveQuarterSchema.parse("2026-q4");
    const requested = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } });
    const primary = success(await h.a.store.write({ action: "put", reference: requested, expected: null,
      content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance }));
    const review = RecordReferenceSchema.parse({ kind: "review/evidence", key: "test", owner: primary.reference.owner });
    success(await h.a.store.write({ action: "put", reference: review, expected: null, content: "{}", provenance }));
    const current = success(await h.a.store.read({ reference: primary.reference }));
    success(await h.a.store.write({ action: "put", reference: primary.reference, expected: current.version, content: current.content,
      placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    const cohort = RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: "group" } });
    success(await h.a.store.write({ action: "put", reference: cohort, expected: null, content: "# Group\n\n**Purpose:** Retain the group.\n",
      placement: { kind: "completed", quarter }, provenance: { verb: "close", lifecycleAction: "close" } }));
    const archive = `refs/arc/archive/${quarter}`;
    await h.a.git(["push", h.remoteName, `${archive}:${archive}`]);
    const imported = success(await h.b.store.push());
    expect(imported.publishes.find((outcome) => outcome.families.includes("work-item"))?.status).toBe("reconciled");
    expect(imported.publishes.find((outcome) => outcome.families.includes("cohort"))?.status).toBe("reconciled");
    expect(status(imported, "review")).toBe("reconciled");
  });
});
