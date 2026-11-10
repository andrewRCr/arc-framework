/** Prepared projection writes bind their editing identity at atomic admission. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { newPersonalAdmission } from "../../../helpers/store/projection/admission-request.js";
import { success } from "../../../helpers/store/suite-tools.js";

it("refuses an asserted identity that differs from the backend and admits the repaired request", async () => {
  const fixture = createReferenceFixture();
  const reference = fixture.reference("personal/working-memory");
  const content = fixture.content(reference);
  const projectionAdmission = newPersonalAdmission(reference, content, "another-user");
  const input = { writes: [{ action: "put" as const, reference, content, expected: null }],
    provenance: { verb: "write-back", lifecycleAction: "edit" }, observations: [{ reference, expected: null }], projectionAdmission };
  const before = success(await fixture.store.version());
  expect(await fixture.store.batch(input)).toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "projection.admission" } });
  expect(success(await fixture.store.version())).toBe(before);
  expect(await fixture.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  input.projectionAdmission = newPersonalAdmission(reference, content);
  success(await fixture.store.batch(input));
  expect(success(await fixture.store.read({ reference })).content).toBe(content);
});
