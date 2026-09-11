import { describe, expect, it } from "vitest";

import {
  observeChangeRequestMergeAdmission,
  type ChangeRequestMergeCoordinates,
  type ChangeRequestMergeObservationPort,
} from "../../../../src/scripts/review-gate/change-request.js";

const oid = (character: string): string => character.repeat(40);
const coordinates: ChangeRequestMergeCoordinates = {
  repository: "owner/repo",
  changeRequest: 42,
  base: oid("a"),
  head: oid("b"),
};

function port(value: unknown): ChangeRequestMergeObservationPort {
  return { observe: async () => value };
}

describe("change-request merge admission", () => {
  it.each([
    { state: "mergeable" as const },
    { state: "base-currentness-required" as const, detail: "The target requires a current base." },
  ])("retains exact coordinates for $state", async (observation) => {
    await expect(observeChangeRequestMergeAdmission(coordinates, port({
      ...coordinates,
      ...observation,
      evidenceRef: "opaque:1",
    }))).resolves.toEqual({ ...coordinates, ...observation, evidenceRef: "opaque:1" });
  });

  it("turns coordinate disagreement into a useful unresolved observation", async () => {
    await expect(observeChangeRequestMergeAdmission(coordinates, port({
      ...coordinates,
      head: oid("c"),
      state: "mergeable",
    }))).resolves.toEqual({
      ...coordinates,
      state: "unresolved",
      detail: "Host admission evidence did not match the requested coordinates.",
    });
  });

  it.each([
    { state: "refused", ...coordinates },
    { state: "unresolved", ...coordinates, detail: "", statusCode: 409 },
    { state: "mergeable", ...coordinates, mergeStateStatus: "CLEAN" },
  ])("conservatively normalizes malformed or provider-shaped evidence %#", async (observation) => {
    const result = await observeChangeRequestMergeAdmission(coordinates, port(observation));
    expect(result).toEqual({
      ...coordinates,
      state: "unresolved",
      detail: "Host admission evidence was malformed or unavailable.",
    });
    expect(JSON.stringify(result)).not.toMatch(/statusCode|mergeStateStatus/u);
  });

  it("preserves actionable detail on terminal semantic negatives", async () => {
    await expect(observeChangeRequestMergeAdmission(coordinates, port({
      ...coordinates,
      state: "refused",
      detail: "Repository policy rejects this request.",
    }))).resolves.toMatchObject({
      state: "refused",
      detail: "Repository policy rejects this request.",
    });
  });
});
