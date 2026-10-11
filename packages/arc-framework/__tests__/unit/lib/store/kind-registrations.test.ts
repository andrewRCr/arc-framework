/** Production registrations preserve the meta codec's observable parse outcomes. */
import { describe, expect, it } from "vitest";
import { createKindRegistry } from "../../../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../src/lib/store/kinds/registrations.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";

describe("production kind registrations", () => {
  it("returns the meta fields from valid core-table content", () => {
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const parsed = registry["work-item/meta"].parser?.(makeMetaFixture("example", { owner: "andrew" }));
    expect(parsed).toMatchObject({ success: true, data: { state: "Active", owner: "andrew" } });
  });
  it("reports a malformed core table as a content parse failure", () => {
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const malformed = makeMetaFixture("example", { owner: "andrew" }).replace(/\| `Active`.*\n/u, "| `Active` |\n");
    expect(registry["work-item/meta"].parser?.(malformed)).toMatchObject({ success: false, error: expect.stringContaining("column-count mismatch") });
  });
});
