import { describe, expect, it } from "vitest";
import { cutMapFixture } from "../../../fixtures/decompose-v4.js";
import { decodeCutMap } from "../../../../src/lib/decompose/cut-map-decode.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";

describe("cut destination references", () => {
  it.each([
    { path: "authoring.sourceAllocations.0.disposition.destinationId", mutate: (v: CutMap) => { v.authoring.sourceAllocations[0]!.disposition = { kind: "target", destinationId: "missing", targetLocator: { artifact: "draft-member-a.md", kind: "preamble" } }; } },
    { path: "authoring.internalEdges.0.from", mutate: (v: CutMap) => { v.authoring.internalEdges[0]!.from = "missing"; } },
    { path: "authoring.internalEdges.0.to", mutate: (v: CutMap) => { v.authoring.internalEdges[0]!.to = "missing"; } },
    { path: "authoring.externalEdges.0.from", mutate: (v: CutMap) => { v.authoring.externalEdges = [{ from: "missing", to: "foundation" }]; } },
    { path: "authoring.incomingDispositions.0.disposition.replacementTargets.0", mutate: (v: CutMap) => { v.authoring.incomingDispositions[0]!.disposition = { kind: "replace", replacementTargets: ["missing"] }; } },
    { path: "authoring.outgoingDispositions.0.disposition.targets.0", mutate: (v: CutMap) => { v.authoring.outgoingDispositions[0]!.disposition = { kind: "targets", targets: ["missing"] }; } },
  ])("refuses an undeclared reference at $path", ({ mutate, path }) => {
    const value = cutMapFixture(); mutate(value);
    expect(decodeCutMap(value)).toMatchObject({ status: "rejected", issue: { code: "authoring-identity", path } });
  });
  it.each([
    { kind: "existing-home" as const, destinationId: "member-b", target: { kind: "document" as const, path: "reference.md" } },
    { kind: "existing-home" as const, destinationId: "member-b", target: { kind: "draft-block" as const, slug: "member-b", locator: { kind: "preamble" as const, artifact: "draft-member-b.md" } } },
    { kind: "cohort-coordination" as const, destinationId: "member-b", cohort: "member-b" },
  ])("excludes non-work-unit $kind destinations from dependency recipients", destination => {
    const value = cutMapFixture(); value.authoring.destinations[1] = destination;
    expect(decodeCutMap(value)).toMatchObject({ status: "rejected", issue: { code: "authoring-identity", path: "authoring.internalEdges.0.to" } });
  });
  it("excludes the retired origin from incoming recipients", () => {
    const value = cutMapFixture();
    value.authoring.incomingDispositions[0]!.disposition = { kind: "replace", replacementTargets: ["origin"] };
    expect(decodeCutMap(value)).toMatchObject({ status: "rejected", issue: { code: "authoring-identity", path: "authoring.incomingDispositions.0.disposition.replacementTargets.0" } });
  });

  it("accepts existing work-unit destinations as dependency recipients", () => {
    const value = cutMapFixture(); value.authoring.shape = "heterogeneous";
    value.authoring.destinations.push({ kind: "existing-home", destinationId: "z-existing", target: { kind: "work-unit", slug: "existing" } });
    value.authoring.internalEdges[0]!.to = "existing";
    expect(decodeCutMap(value).status).toBe("accepted");
  });

});
