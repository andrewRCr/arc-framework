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

it("admits an archive save identity only beside a prepared write of a file under the archive", () => {
  const reference = RecordReferenceSchema.parse({ kind: "work-item/notes",
    owner: { type: "work-item", name: "alpha", uid: "27a401f1-c4b1-4b57-ab0c-4915d4c54021" } });
  const content = "# Notes\n", archiveSaveId = "0f8b8f0e-5b8c-4b3f-9a1f-2f2a4f5e6d7c";
  const request = (path: string) => ({ version: 1, mutationIndex: 0, editingIdentity: "test-user", selection: { kind: "unindexed" },
    local: { path, source: "file", layoutActive: "nested", viewInFlight: { mode: "mine", pins: [] }, claim: null, marker: null,
      indexedMetadata: [], prospectiveMetadata: [] },
    input: { format: "sha1", file: { content, stamp: null, mtimeNs: "0" }, basis: null, base: null,
      rendering: null, resolution: null, recoveringBase: false, retainedBases: [] },
    prepared: { reference, selectedBase: { kind: "empty" }, stamp: null, takenIn: content, retained: null, historicalInputs: [] } });
  const batch = { writes: [{ action: "put", reference, expected: null, content }],
    provenance: { verb: "save", lifecycleAction: "edit", archiveSaveId } };
  const issues = (input: object) => {
    const parsed = BatchInputSchema.safeParse(input);
    return parsed.success ? [] : parsed.error.issues.map(issue => issue.message);
  };
  const refusal = "An archive save identity requires a prepared archive file write";
  expect(issues(batch)).toContain(refusal);
  expect(issues({ ...batch, projectionAdmission: request(".arc/active/alpha/notes-alpha.md") })).toContain(refusal);
  expect(issues({ ...batch, projectionAdmission: request(".arc/completed/2026-q4/01_alpha/notes-alpha.md") })).toEqual([]);
});
