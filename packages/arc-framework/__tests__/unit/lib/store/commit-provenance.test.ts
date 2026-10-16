import { describe, expect, it } from "vitest";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { parseStoreCommitProvenance, renderStoreCommitMessage } from "../../../../src/lib/store/commit-provenance.js";

const uid = "00000000-0000-4000-8000-000000000001";
const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha", uid }, kind: "work-item/meta" });
const provenance = { verb: "archive", lifecycleAction: "complete", codeHead: "a".repeat(40) };

describe("stored commit provenance", () => {
  it("renders and reads caller facts, the batch, and the record's own UID without the actor", () => {
    const message = renderStoreCommitMessage(provenance, reference, "batch-id", "andrew@machine-id");
    expect(message).toBe(`archive alpha\n\nArc-Lifecycle-Action: complete\nArc-Code-Head: ${provenance.codeHead}\nArc-Owner: ${uid}\nArc-Batch: batch-id\nArc-Actor: andrew@machine-id\n`);
    expect(parseStoreCommitProvenance(message, reference)).toEqual({ ...provenance, reference, ownerUid: uid, batchId: "batch-id" });
    const other = RecordReferenceSchema.parse({ owner: { type: "project", name: "arc" }, kind: "project-registry/counter", key: "capture" });
    expect(parseStoreCommitProvenance(message, other)).toEqual({ ...provenance, reference: other, batchId: "batch-id" });
  });
  it.each(["capture\nArc-Batch: forged", '"capture', "capture\tverb", "capture\u0000verb", "capture\rverb"])("quotes the verb %j without creating message lines", (verb) => {
    const message = renderStoreCommitMessage({ verb, lifecycleAction: "update" }, reference, "real-batch");
    expect(message.split("\n")[0]).toBe(`${JSON.stringify(verb)} alpha`);
    expect(parseStoreCommitProvenance(message, reference)).toEqual({ verb, lifecycleAction: "update", reference, ownerUid: uid, batchId: "real-batch" });
  });
  it.each(["update\nArc-Batch: forged", '"update', "update\tstate", "update\u007fstate"])("quotes the lifecycle action %j without forging trailers", (lifecycleAction) => {
    const message = renderStoreCommitMessage({ verb: "capture", lifecycleAction }, reference, "real-batch");
    expect(message.split("\n").filter((line) => line.startsWith("Arc-Batch:"))).toEqual(["Arc-Batch: real-batch"]);
    expect(message).toContain(`Arc-Lifecycle-Action: ${JSON.stringify(lifecycleAction)}\n`);
    expect(parseStoreCommitProvenance(message, reference)).toEqual({ verb: "capture", lifecycleAction, reference, ownerUid: uid, batchId: "real-batch" });
  });
});
