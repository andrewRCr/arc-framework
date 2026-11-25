import { describe, expect, it } from "vitest";

import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { parseMetaRecord, toMetaRecord } from "../../../src/lib/active/meta-reader.js";

describe("makeMetaFixture", () => {
  it("builds a default meta that round-trips through the durable record", () => {
    const markdown = makeMetaFixture("sample");
    const parsed = toMetaRecord(parseMetaRecord(markdown));

    expect(markdown).toContain("# Metadata: sample");
    expect(parsed).toMatchObject({
      state: "Active", owner: "test-owner", branch: null, workClass: "TBD", priority: "P3",
      dependsOn: [], origin: "internal", design: [],
    });
  });

  it("applies a semantic override without changing other fields", () => {
    const original = toMetaRecord(parseMetaRecord(makeMetaFixture("sample")));
    const changed = toMetaRecord(parseMetaRecord(makeMetaFixture("sample", { priority: "P1" })));
    expect(changed).toEqual({ ...original, priority: "P1" });
  });

  it("refuses invalid semantic overrides through the renderer", () => {
    expect(() => makeMetaFixture("sample", { state: "Paused" } as never))
      .toThrow(/Invalid option|invalid_value|expected one of/i);
  });
});
