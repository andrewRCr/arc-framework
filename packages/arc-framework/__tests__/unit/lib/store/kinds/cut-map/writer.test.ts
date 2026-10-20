import { describe, expect, it } from "vitest";
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

describe.each([
  { label: "high", invalid: "\uD800" },
  { label: "low", invalid: "\uDC00" },
])("unpaired $label Unicode surrogate", ({ invalid }) => {
  it.each(["new-member", "existing-home", "cohort-coordination"] as const)(
    "refuses the %s destination before canonical storage and accepts its correction", (kind) => {
      const value = withDestinationIds(kind === "new-member" ? [invalid, "𝄟"] : ["𝄞", "𝄟"]);
      if (kind === "existing-home") {
        value.authoring.shape = "heterogeneous";
        value.authoring.destinations.unshift({ kind, destinationId: invalid, target: { kind: "work-unit", slug: "home" } });
      } else if (kind === "cohort-coordination") {
        value.authoring.destinations.unshift({ kind, destinationId: invalid, cohort: "group" });
      }
      expect(decodeCutMap(JSON.parse(JSON.stringify(value))))
        .toMatchObject({ status: "rejected", issue: { code: "invalid-structure", path: "authoring.destinations.0.destinationId" } });
      for (const destination of value.authoring.destinations) {
        if (destination.destinationId === invalid) destination.destinationId = "member-0";
      }
      for (const allocation of value.authoring.sourceAllocations) {
        if (allocation.disposition.kind === "target" && allocation.disposition.destinationId === invalid) {
          allocation.disposition.destinationId = "member-0";
        }
      }
      expectAcceptedRoundTrip(value);
    },
  );

  it("refuses an allocation reference before identity lookup and accepts its correction", () => {
    const value = withDestinationIds(["member-a", "member-b"], invalid);
    expect(decodeCutMap(JSON.parse(JSON.stringify(value))))
      .toMatchObject({ status: "rejected", issue: { code: "invalid-structure", path: "authoring.sourceAllocations.0.disposition.destinationId" } });
    for (const allocation of value.authoring.sourceAllocations) {
      if (allocation.disposition.kind === "target") allocation.disposition.destinationId = "member-a";
    }
    expectAcceptedRoundTrip(value);
  });
});

function expectAcceptedRoundTrip(input: unknown): void {
  const decoded = decodeCutMap(input);
  expect(decoded.status).toBe("accepted");
  if (decoded.status !== "accepted") throw new Error(JSON.stringify(decoded));
  expect(decodeCutMapContent(writeCutMapRecord(decoded.value))).toEqual({ success: true, data: decoded.value });
}
