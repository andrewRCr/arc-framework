import { describe, expect, it } from "vitest";
import { cutMapFixture } from "../../../../../fixtures/decompose-v4.js";
import { decodeCutMapContent } from "../../../../../../src/lib/store/kinds/cut-map/parser.js";

describe("stored cut map decoding", () => {
  it("decodes a completed version-4 map from formatted JSON", () => {
    const value = cutMapFixture();
    expect(decodeCutMapContent(JSON.stringify(value, null, 2))).toEqual({ success: true, data: value });
  });
  it("reports the rejected schema locus", () => {
    const value = cutMapFixture();
    expect(decodeCutMapContent(JSON.stringify({ ...value, machine: { ...value.machine, origin: { slug: "origin" } } })))
      .toMatchObject({ success: false, error: expect.stringContaining("machine.origin.uid") });
  });
  it("reports malformed JSON as a content refusal", () => {
    expect(decodeCutMapContent("{")).toMatchObject({ success: false, error: expect.stringMatching(/^JSON:/u) });
  });
});
