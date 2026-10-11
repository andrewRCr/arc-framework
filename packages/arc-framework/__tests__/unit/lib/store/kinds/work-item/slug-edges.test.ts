/** Reused slug guards inspect old targets and the batch's surviving edges. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema, ArchiveSequenceSchema } from "../../../../../../src/lib/kernel/index.js";
import { LineageRecordSchema, writeLineageRecord } from "../../../../../../src/lib/store/kinds/lineage/index.js";
import { checkSlugEdges } from "../../../../../../src/lib/store/kinds/work-item/slug-edges.js";
import { ruleRecord, ruleView } from "../../../../../helpers/store/rule-view.js";
import { makeMetaFixture } from "../../../../../helpers/meta-fixture.js";
import { parseMetaRecord } from "../../../../../../src/lib/active/meta-reader.js";
import type { StoreRecord } from "../../../../../../src/lib/store/read.js";
import type { WriteCheckInput } from "../../../../../../src/lib/store/write-check.js";
const own = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const dependentUid = "00000000-0000-4000-8000-000000000003";
function meta(name: string, uid: string, edges: string[] = [], completed = false): StoreRecord {
  const content = makeMetaFixture(name, { dependsOn: edges, state: completed ? "Shipped" : "Active" });
  return ruleRecord("work-item/meta", name, uid, content, parseMetaRecord(content), completed
    ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4"), sequence: ArchiveSequenceSchema.parse("01") } : { kind: "active" });
}
function change(beforeRecords: StoreRecord[], afterRecords: StoreRecord[], prior?: WriteCheckInput["prior"]): WriteCheckInput {
  const next = meta("reused", own);
  return { reference: next.reference, next: { content: next.content, fields: next.fields },
    ...(prior === undefined ? {} : { prior }), writer: { kind: "verb", verb: "create" },
    before: ruleView(beforeRecords), after: ruleView([next, ...afterRecords]) };
}
const retirement = LineageRecordSchema.parse({
  schemaVersion: 2, origin: { name: "reused", uid: other }, kind: "abandon", successors: [], incoming: [],
});
const retired = ruleRecord("lineage/transition", "reused", other, writeLineageRecord(retirement), retirement);
describe("slug edge protection", () => {
  it("refuses an edge left naming a completed generation's reused slug", async () => {
    const dependent = meta("dependent", dependentUid, ["reused"]);
    const result = await checkSlugEdges(change([meta("reused", other, [], true), dependent], [dependent]));
    expect(result).toMatchObject([{ rule: "work-item.slug-edges", condition: expect.stringContaining("dependent") }]);
    expect(result[0]?.remedy.text).toContain("arc wu reconcile --apply");
    expect(result[0]?.remedy.text).toContain("arc resume");
  });
  it("admits an edge the batch settled", async () => {
    expect(await checkSlugEdges(change([meta("reused", other, [], true), meta("dependent", dependentUid, ["reused"])],
      [meta("dependent", dependentUid)]))).toEqual([]);
  });
  it("admits edges in archived records", async () => {
    const archived = meta("dependent", dependentUid, ["reused"], true);
    expect(await checkSlugEdges(change([meta("reused", other, [], true), archived], [archived]))).toEqual([]);
  });
  it("refuses an undisposed edge naming a retired origin even with no primary", async () => {
    const dependent = meta("dependent", dependentUid, ["reused"]);
    expect(await checkSlugEdges(change([retired, dependent], [dependent]))).toMatchObject([{ rule: "work-item.slug-edges" }]);
  });
  it("admits a rename once its own edge is settled", async () => {
    const prior = meta("previous", own, ["reused"]);
    expect(await checkSlugEdges(change([meta("reused", other, [], true), prior], [],
      { content: prior.content, fields: prior.fields }))).toEqual([]);
  });
  it("admits an unused name without treating a missing primary as retirement proof", async () => {
    const dependent = meta("dependent", dependentUid, ["reused"]);
    expect(await checkSlugEdges(change([dependent], [dependent]))).toEqual([]);
  });
  it("admits an edge settled by archiving or removing its dependent in the same batch", async () => {
    const before = [meta("reused", other, [], true), meta("dependent", dependentUid, ["reused"])];
    expect(await checkSlugEdges(change(before, [meta("dependent", dependentUid, ["reused"], true)]))).toEqual([]);
    expect(await checkSlugEdges(change(before, []))).toEqual([]);
  });
  it("refuses incomplete enumeration and admits retry with complete evidence", async () => {
    const input = change([meta("reused", other, [], true)], []);
    input.before = { ...input.before, list: async () => ({ status: "ok", result: {
      status: "complete", records: [], missed: true, diagnostics: [{ kind: "unreadable", key: "dependent",
        condition: "Unreadable entry.", remedy: { text: "Repair the entry." } }],
    } }) };
    expect(await checkSlugEdges(input)).toMatchObject([{ rule: "work-item.slug-edges" }]);
    expect(await checkSlugEdges(change([meta("reused", other, [], true)], []))).toEqual([]);
  });
});
