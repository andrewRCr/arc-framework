/** Excluded machine state never reaches the reference store or its remote. */
import { expect, it } from "vitest";
import { RecordReferenceSchema } from "../../../../src/lib/store/index.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success, testProvenance } from "../../../helpers/store/suite-tools.js";

it.each([".internal/request.json", "work-unit/.internal/checkpoint.json"])("never publishes the excluded path %s", async (key) => {
  const fixture = createReferenceFixture();
  const remote = fixture.remote(true)!;
  const allowed = fixture.reference("personal/document");
  const record = await seed(fixture, allowed);
  success(await fixture.store.sync());
  const localVersion = success(await fixture.store.version());
  const remoteVersion = success(await remote.version());
  const excluded = RecordReferenceSchema.parse({ ...record.reference, key });
  const result = await fixture.store.write({ action: "put", reference: excluded, expected: null,
    content: fixture.content(allowed), provenance: testProvenance });
  expect(result).toMatchObject({ status: "refused", refusal: { class: "recoverable" } });
  if (result.status !== "refused") throw new Error("Expected excluded-path refusal");
  expect(result.refusal.condition).toContain("machine-local");
  expect(result.refusal.remedy.text).toContain("path");
  expect(success(await fixture.store.version())).toEqual(localVersion);
  expect(success(await remote.version())).toEqual(remoteVersion);
  success(await fixture.store.sync());
  expect(await remote.read({ reference: excluded })).toMatchObject({ status: "refused" });
  const localList = success(await fixture.store.list({ family: "personal", kind: "personal/document" }));
  const remoteList = success(await remote.list({ family: "personal", kind: "personal/document" }));
  expect(localList).toMatchObject({ status: "complete", records: [{ reference: record.reference }] });
  expect(remoteList).toMatchObject({ status: "complete", records: [{ reference: record.reference }] });
  expect(localList.status === "complete" && localList.records).toHaveLength(1);
  expect(remoteList.status === "complete" && remoteList.records).toHaveLength(1);
  expect(success(await remote.read({ reference: record.reference })).content).toBe(record.content);
});

it("reserves only the derived identity-root STATUS.USER.md address", async () => {
  const fixture = createReferenceFixture();
  const remote = fixture.remote(true)!;
  const base = fixture.reference("personal/document");
  const derived = RecordReferenceSchema.parse({ ...base, key: "STATUS.USER.md" });
  const before = success(await fixture.store.version());
  const put = { action: "put" as const, reference: derived, expected: null, content: "derived", provenance: testProvenance };
  expect(await fixture.store.write(put)).toMatchObject({ status: "refused", refusal: { class: "recoverable", condition: expect.stringContaining("derived"), remedy: { text: expect.any(String) } } });
  expect(await fixture.store.batch({ writes: [{ ...put, reference: base }, put], provenance: testProvenance })).toMatchObject({ status: "refused" });
  expect(success(await fixture.store.version())).toBe(before);
  for (const key of ["scratch/STATUS.USER.md", "work-unit/one/STATUS.USER.md", "STATUS.USER"]) await seed(fixture, RecordReferenceSchema.parse({ ...base, key }));
  success(await fixture.store.sync());
  for (const store of [fixture.reopen(), remote]) {
    expect(await store.read({ reference: derived })).toMatchObject({ status: "refused" });
    const listed = success(await store.list({ family: "personal", kind: "personal/document" }));
    expect(listed).toMatchObject({ status: "complete", records: [{ reference: { key: "scratch/STATUS.USER.md" } }, { reference: { key: "work-unit/one/STATUS.USER.md" } }, { reference: { key: "STATUS.USER" } }] });
  }
});
