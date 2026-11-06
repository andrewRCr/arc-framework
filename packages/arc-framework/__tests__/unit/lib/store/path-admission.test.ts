/** Batch path admission preserves collision diagnostics without comparing every record pair. */
import { expect, it } from "vitest";
import { RecordReferenceSchema } from "../../../../src/lib/store/index.js";
import { createPreflightRefStore } from "../../../helpers/store/ref-preflight.js";

const document = (key: string) => RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key });
const provenance = { verb: "user", lifecycleAction: "save" };
const put = (reference: ReturnType<typeof document>, content = "Personal bytes.\n") => ({ action: "put" as const, reference, expected: null, content });

it("names both colliding paths with the existing refusal wording before I/O", async () => {
  const result = await createPreflightRefStore().batch({ writes: [put(document("scratch/item")), put(document("scratch/item/child.md"))], provenance });
  expect(result).toMatchObject({ status: "refused", refusal: { code: "unsupported", class: "terminal", case: "unhomed-kind",
    condition: expect.stringMatching(/The path .+ collides with personal\/document .+ at /u) } });
  if (result.status !== "refused") throw new Error("Expected collision refusal");
  expect(result.refusal.condition).toContain("andrew/scratch/item.andrew");
  expect(result.refusal.condition).toContain("andrew/scratch/item/child.md.andrew");
});

it("keeps unresolved owners separate until their own serialization admission", async () => {
  const references = ["alpha", "beta"].map(name => RecordReferenceSchema.parse({ kind: "work-item/record", owner: { type: "work-item", name } }));
  const result = await createPreflightRefStore().batch({ writes: references.map(reference => ({ ...put(reference,
    "-----BEGIN PRIVATE KEY-----\nexample\n-----END PRIVATE KEY-----\n"), placement: { kind: "active" as const } })), provenance });
  expect(result).toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "store.private-key" } });
});
