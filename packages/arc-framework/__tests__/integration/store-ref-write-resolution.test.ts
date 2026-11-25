import { describe, expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";

const provenance = { verb: "test-write", lifecycleAction: "update" };
const primary = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha" }, kind: "work-item/meta" });

describe.each(["files", "reftable"] as const)("write resolution (%s)", (format) => {
  it("refuses a primary without placement before any Git work", async () => {
    const f = await createRefReadFixture(format);
    expect(await f.store.write({ action: "put", reference: primary, expected: null,
      content: makeMetaFixture("alpha"), provenance })).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", reference: primary,
    } });
    expect(f.processes()).toBe(0);
    expect((await f.exec("git", ["for-each-ref", "refs/arc/"])).stdout).toBe("");
  });
  it("mints one UID for a slug creation and every record of that owner in the batch", async () => {
    const f = await createRefReadFixture(format);
    const companion = RecordReferenceSchema.parse({ ...primary, kind: "work-item/companion", key: "extra" });
    const result = await f.store.batch({ provenance, writes: [
      { action: "put", reference: companion, expected: null, content: "shared owner" },
      { action: "put", reference: primary, expected: null, content: makeMetaFixture("alpha"), placement: { kind: "active" } },
    ] });
    expect(result).toMatchObject({ status: "ok", result: { writes: [
      { reference: { owner: { uid: expect.any(String) } }, version: expect.any(String) },
      { reference: { owner: { uid: expect.any(String) } }, version: expect.any(String) },
    ] } });
    if (result.status !== "ok") throw new Error("No created records");
    const [extra, meta] = result.result.writes;
    expect(extra?.reference.owner).toEqual(meta?.reference.owner);
    if (meta?.reference.owner.type !== "work-item") throw new Error("No created work item");
    expect(meta.reference.owner.uid).toMatch(/^[0-9a-f-]{36}$/u);
    const ref = `refs/arc/work/${meta.reference.owner.uid}`;
    expect((await f.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).toBe(ref);
    expect((await f.exec("git", ["show", `${ref}:extra-alpha.md`])).stdout).toBe("shared owner");
    expect(JSON.parse((await f.exec("git", ["show", `${ref}:metadata-${meta.reference.owner.uid}.json`])).stdout))
      .toMatchObject({ slug: "alpha", primary: { role: "work-item/meta", placement: { kind: "active" } } });
    expect(await f.store.read({ reference: primary })).toMatchObject({ status: "ok", result: {
      reference: meta.reference, content: makeMetaFixture("alpha"), version: meta.version,
    } });
  });
  it("resolves a live slug and an authoritative UID onto the existing ref and current name", async () => {
    const f = await createRefReadFixture(format);
    const created = await f.store.write({ action: "put", reference: primary, expected: null,
      content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance });
    if (created.status !== "ok") throw new Error("No created primary");
    const companion = RecordReferenceSchema.parse({ ...primary, kind: "work-item/companion", key: "extra" });
    const written = await f.store.write({ action: "put", reference: companion, expected: null, content: "existing owner", provenance });
    expect(written).toMatchObject({ status: "ok", result: { reference: { owner: created.result.reference.owner } } });
    expect((await f.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout.split("\n")).toHaveLength(1);
    expect(await f.store.read({ reference: companion })).toMatchObject({ status: "ok", result: { content: "existing owner" } });
    const byUid = RecordReferenceSchema.parse({ ...companion, key: "by-uid",
      owner: { ...created.result.reference.owner, name: "old-name" } });
    const uidWrite = await f.store.write({ action: "put", reference: byUid, expected: null, content: "UID owner", provenance });
    expect(uidWrite).toMatchObject({ status: "ok", result: { reference: { owner: created.result.reference.owner } } });
    if (uidWrite.status !== "ok") throw new Error("No UID-resolved write");
    expect(await f.store.read({ reference: uidWrite.result.reference })).toMatchObject({ status: "ok", result: {
      reference: { owner: created.result.reference.owner }, content: "UID owner",
    } });
  });
  it("refuses a personal write without identity before locks and Git, and succeeds after configuration", async () => {
    const f = await createRefReadFixture(format);
    let identity = false;
    const store = createRefStore({ ...f.ports, identity: async () => identity ? SlugSchema.parse("andrew") : null,
      lock: async () => {
        if (!identity) throw new Error("A write without identity must not acquire a lock");
        return async () => {};
      } });
    const personal = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "note.txt" });
    const input = { action: "put" as const, reference: personal, expected: null, content: "personal", provenance };
    expect(await store.write(input)).toMatchObject({ status: "refused", refusal: {
      code: "not-found", reference: personal, condition: expect.stringContaining("arc.identity"),
    } });
    expect(f.processes()).toBe(0);
    expect((await f.exec("git", ["for-each-ref", "refs/arc/"])).stdout).toBe("");
    identity = true;
    expect(await store.write(input)).toMatchObject({ status: "ok" });
    expect(await store.read({ reference: personal })).toMatchObject({ status: "ok", result: { content: "personal" } });
  });
});
