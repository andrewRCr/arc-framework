/** Live membership follows the import's selected locations, including unselected and stale branch copies. */
import { expect, it } from "vitest";
import { deriveWindowLiveBranches, type WindowLiveBranchInput, type WindowLiveComposition } from "../../../../src/scripts/cutover-window/live-branches.js";
import { projectWindowTransientSnapshot } from "../../../../src/scripts/cutover-window/transients.js";
import { TransientIdentityRecordSchema, projectLocusIdentity } from "../../../../src/lib/errand/identity-record.js";
import { ordinaryErrand, transientCommon } from "../../../helpers/store/import-transients.js";

const tip = "a".repeat(40), fetched = "b".repeat(40);
const composition: WindowLiveComposition = { recordsBySlug: new Map([
  ["alpha", { selected: { location: "active" } }], ["done", { selected: { location: "completed" } }],
]), provenanceBySlug: new Map([
  ["alpha", [{ branch: "feat/alpha", ref: "feat/alpha" }, { branch: "stale-copy", ref: fetched }]],
  ["done", [{ branch: "feat/done", ref: "feat/done" }]],
]), qualityFacts: { bySlug: new Map() } };
const input: WindowLiveBranchInput = { composition, checkouts: [{ path: "/primary", branch: "main" }, { path: "/detached", branch: null }],
  identities: [], local: { main: tip, "feat/alpha": tip, "feat/done": tip }, origin: { main: tip, "feat/alpha": fetched, "stale-copy": fetched } };

it("retains registered branches and every live unit copy while excluding completed-only copies", () => {
  const result = deriveWindowLiveBranches(input);
  expect(Object.keys(result).sort()).toEqual(["feat/alpha", "main", "stale-copy"]);
  expect(result.main).toMatchObject({ local: tip, origin: tip, reasons: [expect.stringContaining("/primary")] });
  expect(result["feat/alpha"]).toMatchObject({ local: tip, origin: fetched, reasons: [expect.stringContaining("alpha")] });
  expect(result["stale-copy"]).toMatchObject({ local: null, origin: fetched, reasons: [expect.stringContaining("alpha")] });
});

it("retains the branches named by an all-stale live unit's warnings when no provenance survives", () => {
  const result = deriveWindowLiveBranches({ ...input, composition: { ...composition, provenanceBySlug: new Map(), qualityFacts: { bySlug: new Map([
    ["alpha", { warnings: [{ code: "stale-location-dropped", branch: "feat/stale", workUnit: "alpha", rendered: "Stale branch copy." }] }],
  ]) } }, local: { ...input.local, "feat/stale": tip } });
  expect(result["feat/stale"]).toMatchObject({ local: tip, origin: null, reasons: [expect.stringContaining("alpha")] });
});

it("keeps a registered branch live even when its work unit's selected record is completed", () => {
  expect(deriveWindowLiveBranches({ ...input, checkouts: [{ path: "/completed-checkout", branch: "feat/done" }] })["feat/done"])
    .toMatchObject({ local: tip, origin: null, reasons: [expect.stringContaining("/completed-checkout")] });
});

it("preserves a local branch whose name itself starts with origin", () => {
  const result = deriveWindowLiveBranches({ ...input, composition: { ...composition, provenanceBySlug: new Map([
    ["alpha", [{ branch: "origin/topic", ref: "origin/topic" }]],
  ]) }, local: { "origin/topic": tip } });
  expect(result["origin/topic"]).toMatchObject({ local: tip, origin: null });
  expect(result.topic).toBeUndefined();
});

it.each([
  { state: "open", side: "local", savedHead: null, changeRequest: null },
  { state: "paused", side: "local", savedHead: tip, changeRequest: null },
  { state: "awaiting-merge", side: "origin", savedHead: null, changeRequest: { repositoryRef: "owner/repository",
    hostRef: "https://example.test/pull/1", baseRef: "main", headRef: "chore/example", headSha: tip } },
] as const)("retains an ordinary $state Errand from $side input without adding a grooming branch", item => {
  const { side, ...state } = item;
  const records = [TransientIdentityRecordSchema.parse({ ...ordinaryErrand, ...state }),
    TransientIdentityRecordSchema.parse({ ...transientCommon, claimId: "2".repeat(32), kind: "groom", slug: "groom-alpha", anchorStub: "alpha",
      members: ["alpha"], openedBaseHead: tip, protection: "full", branch: "chore/groom-alpha", state: "open", changeRequest: null })];
  const ref = "refs/arc/user/andrew/errands";
  const projected = projectWindowTransientSnapshot(ref, tip, { kind: "complete", tip, records: new Map(records.map(record => [record.slug, record])),
    objects: new Map(records.map(record => [record.slug, tip])), projections: new Map(records.map(record => [record.slug, projectLocusIdentity(record)])), diagnostics: [] });
  expect(projected.findings).toEqual([]);
  const result = deriveWindowLiveBranches({ ...input, identities: [{ side, records: projected.records }], local: { "chore/example": tip } });
  expect(result["chore/example"]).toMatchObject({ local: tip, origin: null,
    reasons: [expect.stringContaining("example")] });
  expect(result["chore/example"]?.reasons.join(" ")).toContain(side);
  expect(result["chore/example"]?.reasons.join(" ")).toContain(ref);
  expect(result["chore/groom-alpha"]).toBeUndefined();
});

it("records absent tips for branches whose names also occur on the object prototype", () => {
  const result = deriveWindowLiveBranches({ ...input, composition: { ...composition, recordsBySlug: new Map() },
    checkouts: [{ path: "/constructor", branch: "constructor" }, { path: "/to-string", branch: "toString" }],
    local: Object.fromEntries([["constructor", tip]]), origin: {} });
  expect(result.constructor).toEqual({ local: tip, origin: null, reasons: ["Checkout /constructor"] });
  expect(result.toString).toEqual({ local: null, origin: null, reasons: ["Checkout /to-string"] });
});
