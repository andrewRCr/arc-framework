/** Logical transient records retain the import's person, key, kind, and canonical content. */
import { expect, it } from "vitest";
import { projectWindowTransientSnapshot } from "../../../../src/scripts/cutover-window/transients.js";
import { TransientIdentityRecordSchema, serializeTransientIdentityRecord, projectLocusIdentity } from "../../../../src/lib/errand/identity-record.js";
import type { TransientIdentitySnapshot } from "../../../../src/lib/errand/identity-snapshot.js";
import { canonicalize } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { transientCommon } from "../../../helpers/store/import-transients.js";

const ref = "refs/arc/user/andrew/errands", tip = "a".repeat(40);
const records = [
  TransientIdentityRecordSchema.parse({ ...transientCommon, kind: "groom", slug: "groom-alpha", anchorStub: "alpha",
    members: ["alpha"], openedBaseHead: tip, protection: "full", branch: "chore/groom-alpha", state: "open", changeRequest: null }),
  TransientIdentityRecordSchema.parse({ ...transientCommon, kind: "errand", purpose: "housekeep-routing", slug: "housekeep",
    branch: "chore/housekeep", state: "open", savedHead: null, changeRequest: null }),
];
const snapshot: Extract<TransientIdentitySnapshot, { kind: "complete" }> = { kind: "complete", tip,
  objects: new Map(records.map(record => [record.slug, tip])), records: new Map(records.map(record => [record.slug, record])), projections: new Map(records.map(record => [record.slug, projectLocusIdentity(record)])), diagnostics: [] };

it("maps grooming and housekeep claims to the import's logical coordinates and canonical bytes", () => {
  expect(projectWindowTransientSnapshot(ref, tip, snapshot)).toEqual({ findings: [], records: records.map((record, index) => ({
    ref, reference: { kind: index === 0 ? "claims/groom" : "claims/housekeep", owner: { type: "person", name: "andrew" }, key: record.slug },
    content: canonicalize(JSON.parse(serializeTransientIdentityRecord(record))),
  })) });
});

it.each<TransientIdentitySnapshot>([
  { kind: "absent" },
  { kind: "error", stage: "tree", message: "The held tree cannot be read" },
  { ...snapshot, objects: new Map([...snapshot.objects, ["broken", tip]]), diagnostics: [{ kind: "malformed", key: "broken", message: "Invalid JSON" }] },
])("retains an incomplete snapshot as a difference rather than an empty identity: %j", failed => {
  const projected = projectWindowTransientSnapshot(ref, tip, failed);
  expect(projected.records).toEqual([]);
  expect(projected.findings).toEqual([expect.objectContaining({ subject: ref,
    condition: expect.stringContaining(tip), remedy: expect.stringContaining("Repair") })]);
  expect(projected.findings[0]?.condition).toContain(failed.kind === "complete" ? "broken" : failed.kind);
});
