/** Distinct logical identity roles cannot alias one physical target in an atomic batch. */
import { describe, expect, it } from "vitest";
import { trackedWriteFixture } from "../helpers/store/tracked-write-fixture.js";
import { transientContent } from "../helpers/store/in-repo-substrates.js";
import { success } from "../helpers/store/suite-tools.js";
import { OwnerIdentitySchema, RecordReferenceSchema, type RecordReference } from "../../src/lib/store/identity.js";
import { BatchInputSchema, type Mutation } from "../../src/lib/store/write.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { readRefTip, errandsRef } from "../../src/lib/errand/ref-tree.js";

const provenance = { verb: "claim", lifecycleAction: "create" };
const pairs = [
  ["claims/groom", "claims/housekeep", "groom-alpha"],
  ["work-item/record", "claims/housekeep", "alpha"],
] as const;
function reference(kind: typeof pairs[number][0] | "claims/housekeep", key: string): RecordReference {
  const owner = OwnerIdentitySchema.parse({ type: kind === "work-item/record" ? "work-item" : "person",
    name: kind === "work-item/record" ? key : "andrew" });
  return RecordReferenceSchema.parse({ owner, kind, ...(kind === "work-item/record" ? {} : { key }) });
}
function put(ref: RecordReference): Mutation {
  return { action: "put", reference: ref, expected: null, content: transientContent(ref),
    ...(ref.kind === "work-item/record" ? { placement: { kind: "active" as const } } : {}) };
}
async function fixture() {
  const h = await trackedWriteFixture();
  h.ports.identity = async () => SlugSchema.parse("andrew");
  return h;
}

describe.each(pairs)("identity batch %s and %s", (left, right, key) => {
  it.each([false, true])("refuses physical aliases before writing and accepts distinct-key retry, reversed: %s", async (reverse) => {
    const h = await fixture();
    const refs = [reference(left, key), reference(right, key)];
    if (reverse) refs.reverse();
    const before = await readRefTip(h.ports.exec, errandsRef("andrew"));
    expect(await h.store.batch(BatchInputSchema.parse({ writes: refs.map(put), provenance })))
      .toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", class: "recoverable", candidates: refs,
        remedy: { text: expect.stringContaining("one reference") } } });
    expect(await readRefTip(h.ports.exec, errandsRef("andrew"))).toBe(before);
    for (const ref of refs) expect(await h.store.read({ reference: ref })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const distinct = [reference(left, key), reference(right, "beta")];
    const landed = success(await h.store.batch(BatchInputSchema.parse({ writes: distinct.map(put), provenance })));
    for (const write of landed.writes) expect(success(await h.store.read({ reference: write.reference })))
      .toMatchObject({ version: write.version, content: transientContent(write.reference) });
  });

  it("rejects put/removal aliases without changing an existing entry", async () => {
    const h = await fixture(), ref = reference(left, key), other = reference(right, key);
    const created = success(await h.store.write({ ...put(ref), provenance }));
    const before = await readRefTip(h.ports.exec, errandsRef("andrew"));
    const writes: Mutation[] = [{ action: "remove", reference: ref, expected: created.version! },
      { ...put(other), expected: created.version! }];
    expect(await h.store.batch(BatchInputSchema.parse({ writes, provenance })))
      .toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", candidates: [ref, other] } });
    expect(await readRefTip(h.ports.exec, errandsRef("andrew"))).toBe(before);
    expect(success(await h.store.read({ reference: ref })).version).toBe(created.version);
  });
});
