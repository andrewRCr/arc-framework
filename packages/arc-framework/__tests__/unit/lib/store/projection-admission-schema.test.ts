/** Prepared hand edits carry a portable request without filesystem handles. */
import { expect, it } from "vitest";
import { BatchInputSchema, RecordReferenceSchema } from "../../../../src/lib/store/index.js";

it("retains a serialized projection request beside its single content mutation", () => {
  const reference = RecordReferenceSchema.parse({ kind: "personal/working-memory", owner: { type: "person", name: "test-user" } });
  const content = "# Working Memory\n";
  const request = { version: 1, mutationIndex: 0, editingIdentity: "test-user", selection: { kind: "unindexed" },
    local: { path: ".arc/user/test-user/WORKING-MEMORY.md", source: "file", layoutActive: "nested",
      viewInFlight: { mode: "mine", pins: [] }, claim: null, marker: null, indexedMetadata: [], prospectiveMetadata: [] },
    input: { format: "sha1", file: { content, stamp: null, mtimeNs: "0" }, basis: null, base: null,
      rendering: null, resolution: null, recoveringBase: false, retainedBases: [] },
    prepared: { reference, selectedBase: { kind: "empty" }, stamp: null, takenIn: content, retained: null, historicalInputs: [] } };
  const input = { writes: [{ action: "put", reference, expected: null, content }],
    provenance: { verb: "write-back", lifecycleAction: "edit" }, observations: [{ reference, expected: null }], projectionAdmission: request };
  const parsed = BatchInputSchema.safeParse(JSON.parse(JSON.stringify(input)));
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.data).toEqual(input);
});
