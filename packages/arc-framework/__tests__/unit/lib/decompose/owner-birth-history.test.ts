/** Selected binding evidence survives retained branches without assigning authority to history order. */
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { cutMapFixture, cutExtractionFixture } from "../../../fixtures/decompose-v4.js";
import { storedCutMapFixture } from "../../../fixtures/stored-cut-map.js";
import { deriveDecomposeBirthKey, resolveDecomposeOwnerBirth } from "../../../../src/lib/decompose/owner-birth-history.js";
import { HistoryEntrySchema, type HistoryEntry } from "../../../../src/lib/store/contract.js";
import { recordReferences, OwnerIdentitySchema } from "../../../../src/lib/store/identity.js";
import { writeCutMapRecord } from "../../../../src/lib/store/kinds/cut-map/index.js";
import type { StoredCutMap } from "../../../../src/lib/store/kinds/cut-map/schema.js";

const stored = storedCutMapFixture(cutMapFixture());
const reference = recordReferences["work-item/cut-map"](OwnerIdentitySchema.parse({ type: "work-item", name: "origin", uid: stored.map.machine.origin.uid }));
const original = "55555555-5555-4555-8555-555555555555";
const unrelated = "66666666-6666-4666-8666-666666666666";
const binding = stored.ownerBirths.find(birth => birth.name === "member-b")!;

function event(batchId: string, value: StoredCutMap | null, births: readonly string[] = []): HistoryEntry {
  return HistoryEntrySchema.parse({ reference, version: value === null ? null : "repeated-record-version",
    content: value === null ? null : writeCutMapRecord(value),
    provenance: { verb: "decompose", lifecycleAction: value === null ? "discard" : "revise", batchId, reference },
    creationReceipt: { schemaVersion: 1, batchId, createdOwners: births.map(uid => ({ kind: "work-item/meta",
      owner: { type: "work-item", name: binding.name, uid } })) } });
}

function expectEvidence(result: ReturnType<typeof resolveDecomposeOwnerBirth>, batches: readonly string[], uids: readonly string[] = []): void {
  expect(result.status).toBe("refused");
  const rendered = JSON.stringify(result);
  for (const identity of [reference.kind, stored.map.machine.origin.uid, binding.kind, binding.name, binding.birthKey, ...batches, ...uids]) {
    expect(rendered).toContain(identity);
  }
}

it("derives the exact tuple from all prior batch identities including removals, other verbs and repeated versions", () => {
  const removed = event("b", null), first = event("a", stored), duplicate = event("a", stored);
  const merged = HistoryEntrySchema.parse({ ...event("c", stored), provenance: { ...event("c", stored).provenance, verb: "sync" } });
  const expected = createHash("sha256").update(JSON.stringify([
    "arc.decompose.owner-birth/v1", stored.map.machine.origin.uid, binding.kind, binding.name, ["a", "b", "c"],
  ])).digest("hex");
  for (const history of [[removed, duplicate, merged, first], [first, merged, removed, duplicate]]) {
    expect(deriveDecomposeBirthKey(reference, binding, history)).toEqual({ status: "ok", result: expected });
  }
  const missing = { ...first, creationReceipt: undefined, provenance: { message: "Imported event with no retained batch identity" } };
  expect(deriveDecomposeBirthKey(reference, binding, [removed, missing])).toMatchObject({ status: "refused", reason: "unsupported", class: "terminal" });
});

it("follows the selected binding through an unrelated omission/removal and another same-name generation", () => {
  const other = structuredClone(stored);
  other.ownerBirths = other.ownerBirths.map(birth => birth.name === binding.name ? { ...birth, birthKey: "b".repeat(64) } : birth);
  const omission = storedCutMapFixture(cutExtractionFixture());
  const born = event("original", stored, [original]);
  const competing = event("unrelated", other, [unrelated]);
  const removed = event("removed", null), omitted = event("omission", omission);
  const retained = event("retained", stored);
  for (const history of [[retained, competing, removed, omitted, born], [born, omitted, removed, competing, retained]]) {
    expect(resolveDecomposeOwnerBirth(reference, binding, history)).toEqual({ status: "ok", result: original });
  }
});

it("never picks a newest or exact-name generation when the selected key proves two distinct UIDs", () => {
  const first = event("first", stored, [original]), second = event("second", stored, [unrelated]);
  for (const history of [[first, second], [second, first]]) {
    const refusal = resolveDecomposeOwnerBirth(reference, binding, history);
    expect(refusal).toMatchObject({ status: "refused", reason: "unsupported", class: "terminal",
      message: expect.stringContaining("multiple owner generations") });
    expectEvidence(refusal, ["first", "second"], [original, unrelated]);
  }
  expect(resolveDecomposeOwnerBirth(reference, binding, [first, first])).toEqual({ status: "ok", result: original });
});

it("keeps missing receipts distinct from complete-none even when another retained entry proves a UID", () => {
  const completeNone = event("none", stored), born = event("birth", stored, [original]);
  const { creationReceipt: unavailable, ...missing } = event("unknown", stored);
  expect(unavailable).toBeDefined();
  expect(resolveDecomposeOwnerBirth(reference, binding, [completeNone])).toMatchObject({ status: "refused", reason: "unsupported",
    message: expect.stringContaining("no authenticated birth") });
  expectEvidence(resolveDecomposeOwnerBirth(reference, binding, [completeNone]), ["none"]);
  expect(resolveDecomposeOwnerBirth(reference, binding, [born, missing])).toMatchObject({ status: "refused", reason: "unsupported",
    message: expect.stringContaining("unavailable birth evidence") });
  expectEvidence(resolveDecomposeOwnerBirth(reference, binding, [born, missing]), ["unknown"]);
  expect(resolveDecomposeOwnerBirth(reference, binding, [completeNone, born])).toEqual({ status: "ok", result: original });
});

it("names the selected map, binding and batch when a required historical wrapper is invalid", () => {
  const invalid = { ...event("invalid-wrapper", stored), content: "{}" };
  expectEvidence(resolveDecomposeOwnerBirth(reference, binding, [invalid]), ["invalid-wrapper"]);
});
