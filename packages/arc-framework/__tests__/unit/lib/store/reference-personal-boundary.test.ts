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
