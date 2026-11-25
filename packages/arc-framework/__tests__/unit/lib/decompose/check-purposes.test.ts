/** Cohort Purpose fields belong exactly to the documents a cut creates. */
import { expect, it } from "vitest";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { cutMapFixture } from "../../../fixtures/decompose-v4.js";
import { checkDecomposeNames } from "../../../../src/lib/decompose/check-names.js";
import { checkDecomposePurposes } from "../../../../src/lib/decompose/check-purposes.js";

it.each([
  { parent: false, reused: false }, { parent: false, reused: true },
  { parent: true, reused: false }, { parent: true, reused: true },
])("requires the creation Purpose and refuses a reused document's Purpose: $parent/$reused", async ({ parent, reused }) => {
  const h = await createDecomposeOriginFixture();
  if (reused) await h.seedCohort("group");
  const map = cutMapFixture();
  map.authoring.placement = parent ? { kind: "subcohort", cohort: "group/child", purpose: "Coordinate the child.",
    ...(reused ? { parentPurpose: "Replace the parent's Purpose." } : {}) }
    : { kind: "cohort", cohort: "group", ...(reused ? { purpose: "Replace the existing Purpose." } : {}) };
  const names = await checkDecomposeNames(h.store, map);
  if (names.status === "refused") throw new Error(JSON.stringify(names));
  const field = parent ? "parentPurpose" : "purpose";
  const refused = checkDecomposePurposes(map, names.result);
  expect(refused).toMatchObject({ status: "refused", reason: "purpose", class: "recoverable", locus: `authoring.placement.${field}` });
  expect(refused?.remedy.text).toContain(reused ? "Remove" : "Add");
  if (parent && map.authoring.placement.kind === "subcohort") {
    if (reused) delete map.authoring.placement.parentPurpose;
    else map.authoring.placement.parentPurpose = "Coordinate the parent.";
  } else if (map.authoring.placement.kind === "cohort") {
    if (reused) delete map.authoring.placement.purpose;
    else map.authoring.placement.purpose = "Coordinate the work.";
  }
  expect(checkDecomposePurposes(map, names.result)).toBeUndefined();
});
