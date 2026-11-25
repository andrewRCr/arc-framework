/** Write checks see only the configured identity's personal records and transient claims. */
import { expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update, testProvenance } from "../helpers/store/suite-tools.js";

it.each(["default", "separate"] as const)("confines checked reads and lists to the configured identity in %s", async layout => {
  let armed = false;
  const foreignRecords = ["personal/document", "claims/groom"].map(kind => RecordReferenceSchema.parse({
    kind, owner: { type: "person", name: "other-user" }, key: kind === "personal/document" ? "secret.md" : "other-claim",
  }));
  const f = await createRefFixture({ "personal/document": { check: async ({ before, after }) => {
    if (!armed) return [];
    for (const view of [before, after]) {
      for (const reference of foreignRecords) {
        expect(await view.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
        const family = reference.kind.startsWith("claims/") ? "claims" : "personal";
        expect(await view.list({ family, owner: reference.owner })).toMatchObject({ status: "ok", result: { status: "absent" } });
      }
      const own = success(await view.list({ family: "personal" }));
      expect(own).toMatchObject({ status: "complete", records: [expect.objectContaining({ reference: {
        kind: "personal/document", owner: { type: "person", name: "test-user" }, key: expect.any(String),
      } })] });
      expect(await view.list({ family: "claims" })).toMatchObject({ status: "ok", result: { status: "absent" } });
    }
    return [];
  } } }, layout);
  const foreign = createRefStore({ ...f.ports, identity: async () => SlugSchema.parse("other-user"),
    actor: async () => "other-user@00000000-0000-4000-8000-000000000001" });
  for (const reference of foreignRecords) success(await foreign.write({ action: "put", reference, expected: null,
    content: f.content(reference), provenance: testProvenance }));
  const control = await seed(f, f.reference("personal/document"));
  armed = true;
  success(await f.store.write(update(f, control)));
});
