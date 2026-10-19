/** Allocation conservation reports authored loci and admits corrected decisions. */
import { expect, it } from "vitest";
import { cutMapFixture } from "../../../fixtures/decompose-v4.js";
import { checkDecomposeAllocations } from "../../../../src/lib/decompose/allocation-rules.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { checkDecomposeHomes } from "../../../../src/lib/decompose/check-homes.js";

it.each([
  { reason: "duplicate-destination-identity", locus: "authoring.destinations.2", mutate: (map: CutMap) => {
    map.authoring.shape = "heterogeneous";
    map.authoring.destinations.push({ kind: "existing-home", destinationId: "z-home", target: { kind: "work-unit", slug: "member-a" } });
  } },
  { reason: "retiring-origin-destination", locus: "authoring.destinations.2", mutate: (map: CutMap) => {
    map.authoring.shape = "heterogeneous";
    map.authoring.destinations.push({ kind: "existing-home", destinationId: "z-home", target: { kind: "work-unit", slug: "origin" } });
  } },
  { reason: "incompatible-allocation-locator", locus: "authoring.sourceAllocations.0.disposition.targetLocator", mutate: (map: CutMap) => {
    const allocation = map.authoring.sourceAllocations[0];
    if (allocation?.disposition.kind !== "target") throw new Error("Expected target.");
    allocation.disposition.targetLocator.artifact = "notes-member-b.md";
  } },
  { reason: "incompatible-source-ownership", locus: "authoring.sourceAllocations.0.ownership", mutate: (map: CutMap) => {
    const allocation = map.authoring.sourceAllocations[0];
    if (allocation === undefined) throw new Error("Expected allocation.");
    allocation.ownership = "cohort-shared";
  } },
  { reason: "incompatible-source-ownership", locus: "authoring.sourceAllocations.0.ownership", mutate: (map: CutMap) => {
    const allocation = map.authoring.sourceAllocations[0];
    if (allocation === undefined) throw new Error("Expected allocation.");
    allocation.ownership = "cohort-shared";
    allocation.disposition = { kind: "drop", reason: "No destination content required." };
  } },
])("refuses $reason at $locus and admits corrected allocation decisions", ({ reason, locus, mutate }) => {
  const map = cutMapFixture();
  mutate(map);
  const refused = checkDecomposeAllocations(map);
  expect(refused).toMatchObject({ status: "refused", reason, class: "recoverable", locus });
  expect(refused?.remedy.text.length).toBeGreaterThan(0);
  Object.assign(map, cutMapFixture());
  expect(checkDecomposeAllocations(map)).toBeUndefined();
});

it("requires cohort-shared ownership for cohort coordination and admits that correction", () => {
  const map = cutMapFixture();
  map.authoring.destinations.unshift({ kind: "cohort-coordination", destinationId: "coordination", cohort: "group" });
  const allocation = map.authoring.sourceAllocations[0];
  if (allocation?.disposition.kind !== "target") throw new Error("Expected target.");
  allocation.disposition = { kind: "target", destinationId: "coordination",
    targetLocator: { ...allocation.disposition.targetLocator, artifact: "cohort-group.md" } };
  expect(checkDecomposeAllocations(map)).toMatchObject({ status: "refused", reason: "incompatible-source-ownership",
    locus: "authoring.sourceAllocations.0.ownership" });
  allocation.ownership = "cohort-shared";
  expect(checkDecomposeAllocations(map)).toBeUndefined();
});

it.each([
  { profile: "draft", artifact: "draft-member-a.md" },
  { profile: "single-spec", artifact: "spec-member-a.md" },
  { profile: "paired-spec", artifact: "spec-member-a-prd.md" },
  { profile: "paired-spec", artifact: "spec-member-a-rfc.md" },
])("accepts the $profile member's $artifact locator", ({ profile, artifact }) => {
  const map = cutMapFixture();
  map.machine.planningProfile = profile === "draft" ? { kind: "draft", sourceDesign: ["draft-origin.md"] }
    : profile === "single-spec" ? { kind: "single-spec", sourceDesign: ["spec-origin.md"] }
    : { kind: "paired-spec", sourceDesign: ["spec-origin-prd.md", "spec-origin-rfc.md"] };
  for (const allocation of map.authoring.sourceAllocations) {
    if (allocation.disposition.kind === "target") allocation.disposition.targetLocator.artifact = artifact;
  }
  expect(checkDecomposeAllocations(map)).toBeUndefined();
});

it.each(["work-unit", "draft-block", "document"] as const)("checks a %s home's complete allocation locator", kind => {
  const map = cutMapFixture();
  map.authoring.shape = "heterogeneous";
  const allocation = map.authoring.sourceAllocations[0];
  if (allocation?.disposition.kind !== "target") throw new Error("Expected target.");
  const locator = { ...allocation.disposition.targetLocator, artifact: kind === "document" ? "reference.md" : "analysis-home.md" };
  map.authoring.destinations.unshift({ kind: "existing-home", destinationId: "home", target: kind === "document"
    ? { kind, path: "design/reference.md" } : kind === "draft-block" ? { kind, slug: "home", locator } : { kind, slug: "home" } });
  allocation.disposition = { kind: "target", destinationId: "home", targetLocator: locator };
  expect(checkDecomposeAllocations(map)).toBeUndefined();
  if (kind === "draft-block" && locator.kind === "section") {
    allocation.disposition.targetLocator = { ...locator, occurrence: locator.occurrence + 1 };
    expect(checkDecomposeAllocations(map)).toMatchObject({ reason: "incompatible-allocation-locator",
      locus: "authoring.sourceAllocations.0.disposition.targetLocator" });
  }
  allocation.disposition.targetLocator = { ...locator, artifact: "unrelated.md" };
  expect(checkDecomposeAllocations(map)).toMatchObject({ reason: "incompatible-allocation-locator",
    locus: "authoring.sourceAllocations.0.disposition.targetLocator" });
  allocation.disposition.targetLocator = locator;
  expect(checkDecomposeAllocations(map)).toBeUndefined();
});

it.each(["work-unit", "cohort-coordination", "draft-block", "document"] as const)("deduplicates %s destinations by their complete identity", kind => {
  const map = cutMapFixture();
  const destination: CutMap["authoring"]["destinations"][number] = kind === "cohort-coordination"
    ? { kind, destinationId: "z-first", cohort: "group" } : { kind: "existing-home", destinationId: "z-first", target:
      kind === "document" ? { kind, path: "design/reference.md" } : kind === "draft-block"
        ? { kind, slug: "home", locator: { kind: "preamble", artifact: "draft-home.md" } } : { kind, slug: "home" } };
  if (kind !== "cohort-coordination") map.authoring.shape = "heterogeneous";
  map.authoring.destinations.push(destination, { ...structuredClone(destination), destinationId: "z-second" });
  expect(checkDecomposeAllocations(map)).toMatchObject({ reason: "duplicate-destination-identity", locus: "authoring.destinations.3" });
  map.authoring.destinations.pop();
  expect(checkDecomposeAllocations(map)).toBeUndefined();
});

it.each(["identity", "locator"] as const)("uses a former home's canonical generation for allocation %s", async rule => {
  const h = await createDecomposeOriginFixture();
  await h.seedRenamedWorkUnit("old-home", "home");
  const prepared = await prepareDecomposePreflight(h.ctx, "origin");
  if (prepared.status === "refused") throw new Error(JSON.stringify(prepared));
  const map = completeCutMapFixture(prepared.result.machine);
  map.authoring.shape = "heterogeneous";
  map.authoring.destinations.unshift({ kind: "existing-home", destinationId: "home-a", target: { kind: "work-unit", slug: "old-home" } });
  if (rule === "identity") map.authoring.destinations.splice(1, 0,
    { kind: "existing-home", destinationId: "home-b", target: { kind: "work-unit", slug: "home" } });
  else {
    const allocation = map.authoring.sourceAllocations[0];
    if (allocation?.disposition.kind !== "target") throw new Error("Expected target.");
    allocation.disposition = { kind: "target", destinationId: "home-a",
      targetLocator: { ...allocation.disposition.targetLocator, artifact: "analysis-home.md" } };
  }
  const homes = await checkDecomposeHomes(h.ctx, map);
  if (homes.status === "refused") throw new Error(JSON.stringify(homes));
  if (rule === "identity") {
    expect(checkDecomposeAllocations(map, homes.result)).toMatchObject({ reason: "duplicate-destination-identity",
      locus: "authoring.destinations.1" });
    map.authoring.destinations.splice(1, 1);
  }
  expect(checkDecomposeAllocations(map, homes.result)).toBeUndefined();
});
