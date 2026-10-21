import { describe, expect, it } from "vitest";
import { cutMapFixture } from "../../../fixtures/decompose-v4.js";
import { decodeCutMap } from "../../../../src/lib/decompose/cut-map-decode.js";
import { decodeV3DecomposeCutMap } from "../../../../src/lib/work-unit/decompose-v3-schema.js";

describe("cut map decoding", () => {
  it("accepts parsed noncanonical JSON while the version-3 decoder refuses it", () => {
    const value = cutMapFixture();
    const bytes = JSON.stringify(value, null, 4) + "\n";
    expect(decodeCutMap(JSON.parse(bytes))).toEqual({ status: "accepted", value });
    expect(decodeV3DecomposeCutMap(value)).toMatchObject({ status: "rejected", issue: { code: "invalid-structure" } });
  });
  it.each([
    { name: "obsolete version", code: "unsupported-version", path: "schemaVersion", edit: (value: ReturnType<typeof cutMapFixture>) => ({ ...value, schemaVersion: 3 }) },
    { name: "unknown version", code: "invalid-structure", path: "schemaVersion", edit: (value: ReturnType<typeof cutMapFixture>) => ({ ...value, schemaVersion: 5 }) },
    { name: "author slot", code: "incomplete-authoring", path: "authoring.shape", edit: (value: ReturnType<typeof cutMapFixture>) => ({ ...value, authoring: { ...value.authoring, shape: { status: "author" } } }) },
    { name: "extra field", code: "invalid-structure", path: "", edit: (value: ReturnType<typeof cutMapFixture>) => ({ ...value, extra: true }) },
  ])("classifies $name", ({ code, path, edit }) => {
    expect(decodeCutMap(edit(cutMapFixture()))).toMatchObject({ status: "rejected", issue: { code, path } });
  });
});
