import { describe, expect, it } from "vitest";
import { createPreflightRefStore } from "../../../helpers/store/ref-preflight.js";
import { KIND_REGISTRY, RecordReferenceSchema } from "../../../../src/lib/store/index.js";

const provenance = { verb: "merge", lifecycleAction: "test" };
const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "test-user" }, kind: "personal/document", key: "notes.md" });

describe("ref content admission before I/O", () => {
  it("runs serialization before the parser and reports the parser's error before a write check", async () => {
    const registry = { ...KIND_REGISTRY, "personal/document": { ...KIND_REGISTRY["personal/document"],
      parser: () => ({ success: false as const, error: "The requested document is invalid" }),
      check: async (): Promise<never> => { throw new Error("The write check ran before admission"); } } };
    const store = createPreflightRefStore(registry);
    expect(await store.write({ action: "put", reference, expected: null, content: "\0binary", provenance }))
      .toMatchObject({ status: "refused", refusal: { rule: "store.text-only" } });
    expect(await store.write({ action: "put", reference, expected: null, content: "invalid", provenance }))
      .toMatchObject({ status: "refused", refusal: { code: "record-malformed", reference, condition: "The requested document is invalid" } });
  });
  it("propagates parser defects instead of turning them into a content refusal", async () => {
    const store = createPreflightRefStore({ ...KIND_REGISTRY, "personal/document": { ...KIND_REGISTRY["personal/document"],
      parser: (): never => { throw new Error("Parser defect"); } } });
    await expect(store.write({ action: "put", reference, expected: null, content: "text", provenance })).rejects.toThrow("Parser defect");
  });
  it("refuses undeclared entry grammars through write and batch before consulting a port", async () => {
    for (const kind of ["work-item/description", "work-item/inbound", "personal/errand-queue"] as const) {
      const owner = { type: kind.startsWith("personal/") ? "person" : "work-item", name: "test-user" };
      const reference = RecordReferenceSchema.parse({ owner, kind });
      const mutation = { action: "put" as const, reference, expected: null, content: "## Entries\n\n### **Typed entry**\n\nbody\n" };
      const store = createPreflightRefStore();
      for (const operation of ["write", "batch"] as const) {
        const result = operation === "write" ? await store.write({ ...mutation, provenance })
          : await store.batch({ writes: [mutation], provenance });
        expect(result).toMatchObject({ status: "refused", refusal: { code: "unsupported", class: "terminal", case: "unhomed-kind",
          condition: expect.stringContaining(kind) } });
      }
    }
  });
  it("reports duplicate entry IDs before consulting a port", async () => {
    const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "test-user" }, kind: "personal/inbox" });
    const content = "## Errand\n\n### **First**\n- _Id:_ `1234abcd`\n\n### **Second**\n- _Id:_ `1234abcd`\n";
    const mutation = { action: "put" as const, reference, expected: null, content };
    const store = createPreflightRefStore();
    for (const operation of ["write", "batch"] as const) {
      const result = operation === "write" ? await store.write({ ...mutation, provenance }) : await store.batch({ writes: [mutation], provenance });
      expect(result).toMatchObject({ status: "refused", refusal: { code: "record-malformed", reference,
        condition: expect.stringContaining("1234abcd"), remedy: { text: expect.stringContaining("ID") } } });
    }
  });
  it("names a field-header entry missing its removal trigger before consulting a port", async () => {
    const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "test-user" }, kind: "personal/working-memory" });
    for (const suffix of ["body", "_Id:_ `1234abcd`\nbody", "<!-- _Remove when:_ example -->\nbody"]) {
      const mutation = { action: "put" as const, reference, expected: null, content: `## Memories\n\n**Memory:**\n${suffix}\n` };
      const store = createPreflightRefStore();
      expect(await store.write({ ...mutation, provenance })).toMatchObject({ status: "refused", refusal: { code: "record-malformed", reference,
        condition: expect.stringContaining("Memory"), remedy: { text: expect.stringContaining("Remove when") } } });
    }
  });
});
