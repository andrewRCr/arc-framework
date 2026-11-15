/** Unmarked registrations retain their distinct refusal and actionable removal route. */
import { expect, it } from "vitest";
import type { WindowCheckout, WindowCheckoutKind } from "../../../../src/scripts/cutover-window/checkouts.js";
import { windowUnmarkedCheckoutFindings, windowEndedCheckoutFindings, windowErrandHolderFindings } from "../../../../src/scripts/cutover-window/checkout-holders.js";
import type { DerivedCheckoutRow } from "../../../../src/lib/locus/derived-roster.js";
import { classifyWindowCheckout } from "../../../../src/scripts/cutover-window/checkouts.js";
import { ordinaryErrand } from "../../../helpers/store/import-transients.js";
import { TransientIdentityRecordSchema, serializeTransientIdentityRecord } from "../../../../src/lib/errand/identity-record.js";
import { recordReferences, OwnerIdentitySchema } from "../../../../src/lib/store/identity.js";
import { makeHuskStamp } from "../../../helpers/worktree-husk-fixture.js";
import { resolveWorktreeMarkerPath } from "../../../../src/lib/git/worktree-marker.js";

const row: WindowCheckout = { path: "/linked", head: "a".repeat(40), branch: "feat/example", detached: false,
  primary: false, folderPresent: true, kind: "no-marker", marker: { kind: "absent" } };

it.each<WindowCheckoutKind>(["no-marker", "branch-subject", "partial-errand", "manual-only", "pending", "malformed-marker"])(
  "refuses an unmarked %s checkout with its kind, branch and safe removal sequence", kind => {
    const findings = windowUnmarkedCheckoutFindings([{ ...row, kind }]);
    expect(findings).toEqual([expect.objectContaining({ subject: row.path, condition: expect.stringContaining(kind),
      remedy: expect.stringMatching(/tracked-state.*push.*git worktree remove/u) })]);
    expect(findings[0]?.condition).toContain(row.branch);
  });

it("requires unlock before pruning a locked missing-folder registration", () => {
  const findings = windowUnmarkedCheckoutFindings([{ ...row, folderPresent: false, kind: "missing-folder", locked: "Preserve" }]);
  expect(findings).toEqual([expect.objectContaining({ subject: row.path, condition: expect.stringContaining("missing-folder"),
    remedy: expect.stringMatching(/git worktree unlock.*git worktree prune/u) })]);
});

it("requires unlock before removing a locked present checkout", () => {
  const findings = windowUnmarkedCheckoutFindings([{ ...row, locked: null }]);
  expect(findings).toEqual([expect.objectContaining({ subject: row.path,
    remedy: expect.stringMatching(/push the branch, then run git worktree unlock "\/linked", then git worktree remove/u) })]);
});

const rosterRow: DerivedCheckoutRow = { checkout: row, markerGeneration: null, parentCheckoutPath: null, origin: null,
  identity: null, context: null, lifecycleLocation: null, diagnostics: [], kind: "retired", subject: { kind: "work-unit", key: "example" } };

it("refuses a retired work-unit holder with its teardown remedy", () => {
  expect(windowEndedCheckoutFindings([row], [rosterRow])).toEqual([expect.objectContaining({ subject: row.path,
    condition: expect.stringMatching(/retired.*example/u), remedy: "Preserve wanted work, then run arc teardown example, then retry check." })]);
});

it("preserves an unresolved checkout's diagnostic instructions", () => {
  const message = "Recover the missing source, then retry arc materialize example --here.";
  expect(windowEndedCheckoutFindings([row], [{ ...rosterRow, kind: "unresolved-checkout", diagnostics: [{ code: "missing-source", message }] }]))
    .toEqual([expect.objectContaining({ subject: row.path, condition: expect.stringContaining("unresolved-checkout"),
      remedy: expect.stringContaining(message) })]);
});

it("refuses a husked work-unit marker even when the roster has no lifecycle refusal", () => {
  const checkout: WindowCheckout = { ...row, kind: "husk", marker: { kind: "present", marker: { spawnedByArc: true,
    spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z", createdFor: { kind: "work-unit", name: "example" },
    husk: makeHuskStamp({ sha: row.head, at: "2026-01-01T00:00:00.000Z", subject: { kind: "work-unit", name: "example" }, branch: "feat/example" }) } } };
  expect(windowEndedCheckoutFindings([checkout], [])).toEqual([expect.objectContaining({ subject: row.path,
    condition: expect.stringMatching(/husk.*example/u), remedy: expect.stringContaining("arc teardown") })]);
});

const errand = classifyWindowCheckout(row, { kind: "present", marker: { spawnedByArc: true, spawningIdentity: "andrew",
  createdAt: "2026-01-01T00:00:00.000Z", createdFor: { kind: "errand", slug: "example", claimId: "1".repeat(32) }, provisioning: "ready" } });
const identityRecord = (overrides: object = {}) => {
  const record = TransientIdentityRecordSchema.parse({ ...ordinaryErrand, ...overrides });
  return { ref: "refs/arc/user/alex/errands", reference: recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: record.slug })),
    content: serializeTransientIdentityRecord(record) };
};

it.each([{ label: "missing", records: [] }, { label: "different claim", records: [identityRecord({ claimId: "2".repeat(32) })] },
  { label: "different slug", records: [identityRecord({ slug: "other", branch: "chore/other" })] }])(
  "refuses a missing or different Errand holder: $label", ({ records }) => {
    expect(windowErrandHolderFindings([errand], records)).toEqual([expect.objectContaining({ subject: row.path,
      condition: expect.stringMatching(/example.*11111111.*no.*record/u),
      remedy: "Restore the exact holder's local or origin identity record, or preserve wanted work and run git worktree remove \"/linked\", then retry check." })]);
  });

it("requires unlock before removing a locked checkout an unheld Errand marker claims", () => {
  expect(windowErrandHolderFindings([{ ...errand, locked: null }], [])).toEqual([expect.objectContaining({ subject: row.path,
    remedy: "Restore the exact holder's local or origin identity record, or preserve wanted work and run git worktree unlock \"/linked\", then git worktree remove \"/linked\", then retry check." })]);
});

it("sends an unheld Errand marker on the primary checkout to deleting the marker, which Git cannot remove", () => {
  const primary = classifyWindowCheckout({ ...row, primary: true }, errand.marker);
  expect(windowErrandHolderFindings([primary], [])).toEqual([expect.objectContaining({ subject: row.path,
    condition: expect.stringMatching(/example.*no.*record/u),
    remedy: `Restore the exact holder's local or origin identity record, or preserve wanted work and delete the checkout's worktree marker ${JSON.stringify(resolveWorktreeMarkerPath(row.path))}, then retry check.` })]);
});

it.each(["andrew", "alex"])("accepts an exact claim held by %s among other acquired records", identity => {
  const exact = { ...identityRecord(), ref: `refs/arc/user/${identity}/errands` };
  expect(windowErrandHolderFindings([errand], [identityRecord({ claimId: "2".repeat(32) }), exact])).toEqual([]);
});
