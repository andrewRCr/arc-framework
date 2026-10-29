import { describe, expect, it } from "vitest";
import { createPreflightRefStore } from "../../../helpers/store/ref-preflight.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/index.js";

const projectId = "abcdefab-cdef-4abc-8def-abcdefabcdef";
const reference = RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "project-registry/identity" });

describe("project identity content admission", () => {
  it.each([{}, { projectId: "invalid" }, { projectId: projectId.toUpperCase() }, { projectId, extra: true },
    { projectId: 42 }, [projectId], null])("refuses an invalid project identity before consulting a port: %j", async (value) => {
    const store = createPreflightRefStore();
    expect(await store.write({ action: "put", reference, expected: null, content: JSON.stringify(value),
      provenance: { verb: "initialize", lifecycleAction: "test" } })).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", reference, rule: "store.project-identity", remedy: { text: expect.stringContaining("projectId") },
    } });
  });
});
