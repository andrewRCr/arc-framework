/** Identity admission distinguishes ordinary Errands from claims and preserves input provenance. */
import { expect, it } from "vitest";
import { windowErrandInputFindings, windowIdentityTipFindings, windowForeignClaimFindings } from "../../../../src/scripts/cutover-window/identity-inputs.js";
import { projectWindowTransientSnapshot, type WindowTransientInput } from "../../../../src/scripts/cutover-window/transients.js";
import { TransientIdentityRecordSchema, projectLocusIdentity } from "../../../../src/lib/errand/identity-record.js";
import type { TransientIdentitySnapshot } from "../../../../src/lib/errand/identity-snapshot.js";
import { windowClaims } from "../../../helpers/cutover-window/identity-inputs.js";
import { ordinaryErrand } from "../../../helpers/store/import-transients.js";

const tip = "a".repeat(40), ref = "refs/arc/user/andrew/errands";
function inputFor(value: unknown, side: "local" | "origin", identity = "andrew"): WindowTransientInput {
  const record = TransientIdentityRecordSchema.parse(value);
  const snapshot: Extract<TransientIdentitySnapshot, { kind: "complete" }> = { kind: "complete", tip,
    records: new Map([[record.slug, record]]), objects: new Map([[record.slug, tip]]),
    projections: new Map([[record.slug, projectLocusIdentity(record)]]), diagnostics: [] };
  return { side, records: projectWindowTransientSnapshot(`refs/arc/user/${identity}/errands`, tip, snapshot).records };
}

it.each((["open", "paused", "awaiting-merge"] as const).flatMap(state =>
  (["local", "origin"] as const).map(side => ({ state, side }))))("refuses a $state Errand in $side", ({ state, side }) => {
  const input = inputFor({ ...ordinaryErrand, state, savedHead: state === "paused" ? tip : null,
    changeRequest: state === "awaiting-merge" ? { repositoryRef: "owner/repository", hostRef: "7", baseRef: "main",
      headRef: "chore/example", headSha: tip } : null }, side);
  expect(windowErrandInputFindings([input])).toEqual([
    { subject: "Errand example", condition: expect.stringContaining(`${side} ${ref}`), remedy: expect.stringContaining("abandon") },
  ]);
  expect(windowErrandInputFindings([{ side, records: [] }])).toEqual([]);
});

it.each(windowClaims(tip))("admits the $kind record as an import claim", record => {
  expect(windowErrandInputFindings([inputFor(record, "local"), inputFor(record, "origin")])).toEqual([]);
});

it.each([undefined, "b".repeat(40)])("refuses origin tip disagreement with local %s until aligned", local => {
  const origin = { [ref]: tip };
  const localRefs: Record<string, string> = local === undefined ? {} : { [ref]: local };
  expect(windowIdentityTipFindings({ local: localRefs, origin })).toEqual([
    { subject: ref, condition: expect.stringContaining(tip), remedy: expect.stringMatching(/fetch.*push.*diverg/iu) },
  ]);
  expect(windowIdentityTipFindings({ local: origin, origin })).toEqual([]);
  expect(windowIdentityTipFindings({ local: origin, origin: {} })).toEqual([]);
});

it.each(windowClaims(tip).flatMap(record => (["local", "origin"] as const).map(side => ({ record, side }))))(
  "refuses another identity's $record.kind claim in $side", ({ record, side }) => {
    const input = inputFor(record, side, "alex");
    expect(windowForeignClaimFindings([input], "andrew")).toEqual([
      { subject: "identity alex", condition: expect.stringContaining(side), remedy: expect.stringContaining("alex") },
    ]);
    expect(windowForeignClaimFindings([input], "alex")).toEqual([]);
  },
);
