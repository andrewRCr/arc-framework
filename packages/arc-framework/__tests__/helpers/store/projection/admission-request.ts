/** Portable new-file projection input used by contract tests at the public batch boundary. */
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import type { RecordReference } from "../../../../src/lib/store/identity.js";
import { ProjectionAdmissionSchema, type ProjectionAdmission } from "../../../../src/lib/store/projection-admission.js";

/** Describe a settled fixed personal file, without asserting any stored authority. */
export function newPersonalAdmission(reference: RecordReference, content: string, editingIdentity = "test-user"): ProjectionAdmission {
  return ProjectionAdmissionSchema.parse({ version: 1, mutationIndex: 0, editingIdentity: SlugSchema.parse(editingIdentity),
    selection: { kind: "unindexed" },
    local: { path: `.arc/user/${reference.owner.name}/WORKING-MEMORY.md`, source: "file", layoutActive: "nested",
      viewInFlight: { mode: "mine", pins: [] }, claim: null, marker: null, indexedMetadata: [], prospectiveMetadata: [] },
    input: { format: "sha1", file: { content, stamp: null, mtimeNs: "0" }, basis: null, base: null,
      rendering: null, resolution: null, recoveringBase: false, retainedBases: [] },
    prepared: { reference, selectedBase: { kind: "empty" }, stamp: null, takenIn: content, retained: null, historicalInputs: [] } });
}
