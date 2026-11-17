/** Persist evidence comes from authoritative current reads made before the invocation returns. */
import { describe, expect, it } from "vitest";
import { observePersistSave } from "../../../fixtures/store/projection-persist-observation.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";

async function fixture() {
  const f = createReferenceFixture(), reference = f.reference("personal/inbox");
  const content = f.content(reference, "valid");
  success(await f.store.write({ action: "put", reference, expected: null, content,
    provenance: { verb: "save", lifecycleAction: "save" } }));
  return { ...f, reference, content };
}

describe("persist current-read evidence", () => {
  it("counts authoritative current content observed during the invocation", async () => {
    const f = await fixture(), observation = observePersistSave(f.store, f.reference, f.content);
    const receipt = await observation.during(() => observation.store.read({ reference: f.reference }));
    expect(success(receipt.result).content).toBe(f.content);
    expect(receipt.observedSave).toBe(true);
  });

  it("does not count an explicitly historical read", async () => {
    const f = await fixture(), asOf = success(await f.store.version());
    const observation = observePersistSave(f.store, f.reference, f.content);
    const receipt = await observation.during(() => observation.store.read({ reference: f.reference, asOf }));
    expect(success(receipt.result).content).toBe(f.content);
    expect(receipt.observedSave).toBe(false);
  });

  it("delegates writes without treating submitted content as observed Store content", async () => {
    const f = await fixture(), current = success(await f.store.read({ reference: f.reference }));
    const content = f.content.replace("#", "# Saved");
    const observation = observePersistSave(f.store, f.reference, content);
    const receipt = await observation.during(() => observation.store.write({ action: "put", reference: f.reference,
      expected: current.version, content, provenance: { verb: "save", lifecycleAction: "save" } }));
    success(receipt.result);
    expect(success(await f.store.read({ reference: f.reference })).content).toBe(content);
    expect(receipt.observedSave).toBe(false);
  });

  it("does not credit another record containing the same bytes", async () => {
    const f = await fixture(), reference = f.reference;
    const other = RecordReferenceSchema.parse({ ...reference, owner: { type: "person", name: "another" } });
    const observation = observePersistSave(f.store, other, f.content);
    const receipt = await observation.during(() => observation.store.read({ reference }));
    expect(success(receipt.result).content).toBe(f.content);
    expect(receipt.observedSave).toBe(false);
  });

  it("excludes reads outside the invocation and keeps the returned receipt unchanged", async () => {
    const f = await fixture(), observation = observePersistSave(f.store, f.reference, f.content);
    expect(success(await observation.store.read({ reference: f.reference })).content).toBe(f.content);
    const receipt = await observation.during(() => Promise.resolve("persisted"));
    expect(receipt).toEqual({ result: "persisted", observedSave: false });
    expect(success(await observation.store.read({ reference: f.reference })).content).toBe(f.content);
    expect(receipt).toEqual({ result: "persisted", observedSave: false });
  });
});
