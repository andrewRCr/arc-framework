/** No unit setup selects the in-repo store unless a test asks for it. */
import { expect, it } from "vitest";
import { IN_REPO_STORE_OVERRIDE } from "../../src/lib/store/selection.js";

it("leaves the in-repo store override unset in the unit worker", () => {
  expect(process.env[IN_REPO_STORE_OVERRIDE]).toBeUndefined();
});
