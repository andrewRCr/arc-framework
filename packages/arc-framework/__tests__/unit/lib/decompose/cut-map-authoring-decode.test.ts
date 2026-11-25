import { describe, expect, it } from "vitest";
import { cutMapFixture } from "../../../fixtures/decompose-v4.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";
import { decodeCutMap } from "../../../../src/lib/decompose/cut-map-decode.js";

describe("cut authored identities", () => {
  it.each(["sourceAllocations", "incomingDispositions", "outgoingDispositions"] as const)("preserves exactly the %s inventory", collection => {
    const value = cutMapFixture();
    value.authoring[collection].pop();
    expect(decodeCutMap(value)).toMatchObject({ status: "rejected", issue: { code: "authoring-identity", path: `authoring.${collection}` } });
  });
  it.each(["sourceAllocations", "incomingDispositions", "outgoingDispositions"] as const)("preserves machine order in %s", collection => {
    const value = cutMapFixture();
    value.authoring[collection].reverse();
    expect(decodeCutMap(value)).toMatchObject({ status: "rejected", issue: { code: "authoring-identity", path: `authoring.${collection}` } });
  });
  it.each([
    { path: "authoring.destinations", mutate: (v: CutMap) => { v.authoring.destinations.reverse(); } },
    { path: "authoring.internalEdges", mutate: (v: CutMap) => { v.authoring.internalEdges.push(v.authoring.internalEdges[0]!); } },
    { path: "authoring.externalEdges", mutate: (v: CutMap) => { v.authoring.externalEdges = [{ from: "member-b", to: "foundation-b" }, { from: "member-a", to: "foundation-a" }]; } },
    { path: "authoring.incomingDispositions", mutate: (v: CutMap) => { v.authoring.incomingDispositions[0]!.disposition = { kind: "replace", replacementTargets: ["member-b", "member-a"] }; } },
    { path: "authoring.outgoingDispositions", mutate: (v: CutMap) => { v.authoring.outgoingDispositions[0]!.disposition = { kind: "targets", targets: ["member-a", "member-a"] }; } },
  ])("requires unique UTF-8 order in $path", ({ mutate, path }) => {
    const value = cutMapFixture(); mutate(value);
    expect(decodeCutMap(value)).toMatchObject({ status: "rejected", issue: { code: "authoring-order", path } });
  });

});
