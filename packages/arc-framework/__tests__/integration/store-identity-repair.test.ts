/** Restoring configured identity reopens the normal personal and transient read paths. */
import { describe, expect, it } from "vitest";
import { personalFixture, personalReference, personalProvenance } from "../helpers/store/personal-fixture.js";
import { syncPut } from "../helpers/store/sync-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

describe("identity admission repair", () => {
  it.each(["personal", "transient"] as const)("reads existing %s state after restoring identity", async (substrate) => {
    const h = await personalFixture();
    const put = substrate === "personal" ? { action: "put" as const, reference: personalReference("personal/document", "notes.md"), expected: null, content: "personal notes\n", provenance: personalProvenance } : syncPut();
    success(await h.store.write(put));
    const before = success(await h.store.read({ reference: put.reference }));
    const asOf = success(await h.store.version());
    const selection = substrate === "personal" ? { family: "personal" as const, kind: "personal/document" as const } : { family: "work-item" as const, kind: "work-item/record" as const };
    const configured = h.ports.identity;
    h.ports.identity = async () => null;
    const missing = { status: "refused", refusal: { code: "not-found", remedy: { text: expect.stringContaining("arc.identity") } } };
    expect(await h.store.read({ reference: put.reference, asOf })).toMatchObject(missing);
    expect(await h.store.history({ reference: put.reference })).toMatchObject(missing);
    expect(await h.store.changes({ from: asOf, to: asOf, references: [put.reference] })).toMatchObject(missing);
    expect(await h.store.list({ ...selection, asOf })).toEqual({ status: "ok", result: { status: "absent" } });
    h.ports.identity = configured;
    expect(success(await h.store.read({ reference: put.reference }))).toEqual(before);
    expect(success(await h.store.list(selection))).toMatchObject({ status: "complete", records: [{ reference: put.reference, content: before.content, version: before.version }] });
    expect(await h.store.read({ reference: put.reference, asOf })).toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "uncovered-state-version" } });
    if (substrate === "transient") expect(success(await h.store.history({ reference: put.reference }))).toMatchObject([{ content: before.content, version: before.version }]);
  });
});
