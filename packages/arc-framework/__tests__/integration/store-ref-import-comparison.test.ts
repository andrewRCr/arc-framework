/** The differential import harness observes record, parsed-field, and diagnostic loss. */
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, type MigrateReport } from "../../src/lib/store/index.js";
import { importComparisonFixture } from "../helpers/store/import-comparison.js";
import { success } from "../helpers/store/suite-tools.js";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { CandidateManagedRecordV1Schema } from "../../src/lib/work-unit/candidate-attestation.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";

describe.each(["default", "separate"] as const)("import comparison in %s", (layout) => {
  it("reports a record's content and parsed purpose when they drift beyond its allowed transform", async () => {
    const h = await importComparisonFixture(layout);
    expect(await h.target.migrate()).toMatchObject({ status: "ok" });
    expect(await h.compare()).toEqual([]);
    const reference = RecordReferenceSchema.parse({ kind: "work-item/spec", owner: { type: "work-item", name: "alpha" } });
    const record = success(await h.store.read({ reference }));
    success(await h.store.write({ action: "put", reference: record.reference, expected: record.version,
      content: record.content.replace("Define the example.", "Changed beyond the source."),
      provenance: { verb: "edit", lifecycleAction: "edit" } }));
    expect(await h.compare()).toEqual(expect.arrayContaining([
      expect.objectContaining({ reference: expect.objectContaining({ kind: "work-item/spec" }), field: "content" }),
      expect.objectContaining({ reference: expect.objectContaining({ kind: "work-item/spec" }), field: "fields.purpose" }),
    ]));
  });
  it("compares every live work-unit record and cohort clean against an independent source copy", async () => {
    const h = await importComparisonFixture(layout);
    expect(h.source.root).not.toBe(h.target.root);
    const trial = await h.target.migrate(true), imported = await h.target.migrate();
    expect(trial.status, JSON.stringify(trial)).toBe("ok");
    expect(imported.status, JSON.stringify(imported)).toBe("ok");
    if (trial.status !== "ok" || imported.status !== "ok") throw new Error("Comparison fixture import refused");
    const mask = (rows: MigrateReport["refs"]) => rows.map((row) => JSON.stringify({ ...row,
      ref: row.ref.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gu, "<uid>"),
    })).sort();
    expect(mask(imported.result.refs)).toEqual(mask(trial.result.refs));
    const scope = layout === "separate" ? [`--git-dir=${join(h.target.root, ".git/arc/store")}`] : [];
    const refs = async () => (await h.target.git("git", [...scope, "for-each-ref", "--format=%(refname) %(objectname)",
      "refs/arc/work/", "refs/arc/cohort/", "refs/arc/project/"])).stdout;
    const before = await refs();
    expect(await h.compare()).toEqual([]);
    expect(await h.target.migrate()).toMatchObject({ status: "ok" });
    expect(await refs()).toBe(before);
    expect(await h.compare()).toEqual([]);
    const record = success(await h.store.read({ reference: RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: "group" } }) }));
    success(await h.store.write({ action: "put", reference: record.reference, expected: record.version,
      content: record.content.replace("Coordinate the example work.", "Changed beyond the source."), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    expect(await h.compare()).toEqual(expect.arrayContaining([
      expect.objectContaining({ reference: expect.objectContaining({ kind: "cohort/document" }), field: "content" }),
    ]));
  });
  it("ignores inbox ID stamps while reporting changed entry prose", async () => {
    const h = await importComparisonFixture(layout);
    expect(await h.target.migrate()).toMatchObject({ status: "ok" });
    expect(await h.compare()).toEqual([]);
    const record = success(await h.store.read({ reference: RecordReferenceSchema.parse({ kind: "project-inbox/inbox", owner: { type: "project", name: "project" } }) }));
    expect(record.content).toMatch(/_Id:_ `[0-9a-f]{8}`/u);
    success(await h.store.write({ action: "put", reference: record.reference, expected: record.version,
      content: record.content.replace("First source entry.", "Unexpected imported entry."), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    expect(await h.compare()).toEqual(expect.arrayContaining([
      expect.objectContaining({ reference: expect.objectContaining({ kind: "project-inbox/inbox" }), field: "content" }),
    ]));
  });
  it("reports a dropped Candidate that the source lists only as a malformed diagnostic", async () => {
    const path = resolveArcPath({ kind: "candidate-record", slug: SlugSchema.parse("alpha") });
    const h = await importComparisonFixture(layout, async (fixture) => {
      const legacy = JSON.parse(await readFile(join(fixture.root, path), "utf8")) as Record<string, unknown>;
      legacy.schemaVersion = 99;
      await writeFile(join(fixture.root, path), canonicalize(legacy));
    });
    expect(await h.target.migrate()).toMatchObject({ status: "ok" });
    expect(await h.compare()).toEqual([]);
    const reference = RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: "alpha" } });
    const record = success(await h.store.read({ reference }));
    success(await h.store.write({ action: "remove", reference: record.reference, expected: record.version, provenance: { verb: "edit", lifecycleAction: "edit" } }));
    expect(await h.compare()).toEqual(expect.arrayContaining([
      expect.objectContaining({ reference: expect.objectContaining({ kind: "review/candidate" }), field: "diagnostic" }),
    ]));
  });
  it("matches a source diagnostic to the retained record's diagnostic in a stricter registry", async () => {
    const path = resolveArcPath({ kind: "candidate-record", slug: SlugSchema.parse("alpha") });
    const h = await importComparisonFixture(layout, async (fixture) => {
      const legacy = JSON.parse(await readFile(join(fixture.root, path), "utf8")) as Record<string, unknown>;
      legacy.schemaVersion = 99;
      await writeFile(join(fixture.root, path), canonicalize(legacy));
    });
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    h.target.ports.registry = { ...registry, "review/candidate": { ...registry["review/candidate"], parser: (content: string) => {
      const parsed = CandidateManagedRecordV1Schema.safeParse(JSON.parse(content));
      return parsed.success ? { success: true as const, data: parsed.data } : { success: false as const, error: parsed.error.message };
    } } };
    expect(await h.target.migrate()).toMatchObject({ status: "ok" });
    const listed = success(await h.store.list({ family: "review", kind: "review/candidate" }));
    expect(listed).toMatchObject({ status: "complete", diagnostics: [expect.objectContaining({ kind: "malformed" })] });
    expect(await h.compare()).toEqual([]);
  });
});
