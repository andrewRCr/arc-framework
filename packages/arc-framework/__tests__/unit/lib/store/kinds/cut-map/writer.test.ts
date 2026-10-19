import { expect, it } from "vitest";
import { canonicalize } from "../../../../../../src/lib/kernel/canonical/canonical-json.js";
import { cutMapFixture } from "../../../../../fixtures/decompose-v4.js";
import { decodeCutMapContent, writeCutMapRecord } from "../../../../../../src/lib/store/kinds/cut-map/index.js";

it("renders canonical JSON that round-trips through the stored map codec", () => {
  const value = cutMapFixture();
  const content = writeCutMapRecord(value);
  expect(content).toBe(canonicalize(value));
  expect(decodeCutMapContent(content)).toEqual({ success: true, data: value });
});
