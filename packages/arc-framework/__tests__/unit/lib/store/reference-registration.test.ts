/** Registry overrides reach the backend opened by its conformance registration. */
import { expect, it } from "vitest";
import { referenceRegistration } from "../../../helpers/store/reference-fixture.js";
import { testProvenance } from "../../../helpers/store/suite-tools.js";

it("opens a backend with the supplied parser override", async () => {
  const fixture = await referenceRegistration.create({
    "project-registry/counter": { parser: () => ({ success: false, error: "Counter rejected by this fixture" }) },
  });
  const reference = fixture.reference("project-registry/counter");
  expect(await fixture.store.write({ action: "put", reference, expected: null,
    content: fixture.content(reference), provenance: testProvenance })).toMatchObject({
    status: "refused", refusal: { code: "record-malformed", condition: "Counter rejected by this fixture" },
  });
});
