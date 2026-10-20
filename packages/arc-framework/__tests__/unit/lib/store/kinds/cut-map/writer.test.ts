import { expect, it } from "vitest";
import { canonicalize } from "../../../../../../src/lib/kernel/canonical/canonical-json.js";
import { cutMapFixture } from "../../../../../fixtures/decompose-v4.js";
import { decodeCutMapContent, writeCutMapRecord } from "../../../../../../src/lib/store/kinds/cut-map/index.js";
import { decodeCutMap } from "../../../../../../src/lib/decompose/cut-map-decode.js";

it("renders canonical JSON that round-trips through the stored map codec", () => {
  const value = cutMapFixture();
  const content = writeCutMapRecord(value);
  expect(content).toBe(canonicalize(value));
  expect(decodeCutMapContent(content)).toEqual({ success: true, data: value });
});

function withDestinationIds(ids: readonly [string, string], reference = ids[0]) {
  const value = cutMapFixture();
  for (const [index, destination] of value.authoring.destinations.entries()) destination.destinationId = ids[index] ?? destination.destinationId;
  for (const allocation of value.authoring.sourceAllocations) {
    if (allocation.disposition.kind === "target") allocation.disposition.destinationId = reference;
  }
  return value;
}

it.each([
  { ids: ["f", "e\u0301"] as const, reference: "f", normalized: ["f", "é"] },
  { ids: ["e\u0301", "𝄞"] as const, reference: "é", normalized: ["é", "𝄞"] },
])("normalizes destination declarations and references before a non-ASCII round trip: $normalized", ({ ids, reference, normalized }) => {
  const decoded = decodeCutMap(withDestinationIds(ids, reference));
  expect(decoded.status).toBe("accepted");
  if (decoded.status !== "accepted") throw new Error(JSON.stringify(decoded));
  expect(decoded.value.authoring.destinations.map(destination => destination.destinationId)).toEqual(normalized);
  expect(decodeCutMapContent(writeCutMapRecord(decoded.value))).toEqual({ success: true, data: decoded.value });
});

it.each([
  ["e\u0301", "f"],
  ["e\u0301", "é"],
] as const)("rejects normalization-induced order or identity collisions before accepting %s and %s", (first, second) => {
  expect(decodeCutMap(withDestinationIds([first, second])))
    .toMatchObject({ status: "rejected", issue: { code: "authoring-order", path: "authoring.destinations" } });
});
