import { describe, expect, it } from "vitest";
import { createPreflightRefStore } from "../../../helpers/store/ref-preflight.js";
import { KIND_REGISTRY, KIND_SHAPES, RecordReferenceSchema, RecordVersionSchema, type KindId } from "../../../../src/lib/store/index.js";

const provenance = { verb: "edit", lifecycleAction: "test" };

describe("ref writer admission before I/O", () => {
  it("refuses unauthorized puts and removals for every served write-once kind", async () => {
    for (const kind of Object.keys(KIND_REGISTRY) as KindId[]) {
      const definition = KIND_REGISTRY[kind];
      if (!definition.ref || definition.writerRule !== "write-once") continue;
      const reference = RecordReferenceSchema.parse({ owner: { type: KIND_SHAPES[kind].owner, name: "test-owner" }, kind, key: "conflict" });
      const store = createPreflightRefStore();
      for (const action of ["put", "remove"] as const) {
        const mutation = action === "put" ? { action, reference, expected: null, content: "{}" }
          : { action, reference, expected: RecordVersionSchema.parse("observed"),
            ...(kind.endsWith("/conflict-record") ? { resolves: [reference] } : {}) };
        expect(await store.write({ ...mutation, provenance })).toMatchObject({ status: "refused", refusal: {
          code: "record-malformed", reference, condition: expect.stringContaining("writer verbs"),
        } });
        expect(await store.batch({ writes: [mutation], provenance })).toMatchObject({ status: "refused", refusal: {
          code: "record-malformed", reference, condition: expect.stringContaining("writer verbs"),
        } });
      }
    }
  });
  it("requires a conflict removal to name itself in resolves before consulting a port", async () => {
    const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "test-owner", uid: "00000000-0000-4000-8000-000000000001" },
      kind: "work-item/conflict-record", key: "conflict" });
    const wrongKey = RecordReferenceSchema.parse({ ...reference, key: "another" });
    const wrongGeneration = RecordReferenceSchema.parse({ ...reference,
      owner: { ...reference.owner, uid: "00000000-0000-4000-8000-000000000002" } });
    const store = createPreflightRefStore();
    for (const resolves of [undefined, [], [wrongKey], [wrongGeneration]]) {
      const mutation = { action: "remove" as const, reference, expected: RecordVersionSchema.parse("observed"), resolves };
      expect(await store.write({ ...mutation, provenance: { ...provenance, verb: "resolve" } })).toMatchObject({ status: "refused", refusal: {
        code: "record-malformed", reference, condition: expect.stringContaining("resolves"),
        remedy: { text: expect.stringContaining("Name this conflict in resolves") },
      } });
    }
  });
  it.each(["scratch/.DS_Store", "notes.md~", "drafts/.notes.md.swp", "._notes.md", "Thumbs.db"])(
    "refuses a new personal record at a side file before I/O, yet admits its update and removal (%s)", async key => {
      const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "test-user" }, kind: "personal/document", key });
      const store = createPreflightRefStore();
      const create = { action: "put" as const, reference, expected: null, content: "saved\n" };
      for (const result of [await store.write({ ...create, provenance }), await store.batch({ writes: [create], provenance })]) {
        expect(result).toMatchObject({ status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference,
          condition: expect.stringContaining("side file"), remedy: { text: expect.stringContaining("Choose a key") } } });
      }
      const expected = RecordVersionSchema.parse("observed");
      await expect(store.write({ action: "put", reference, expected, content: "saved\n", provenance })).rejects.toThrow("Admission consulted");
      await expect(store.write({ action: "remove", reference, expected, provenance })).rejects.toThrow("Admission consulted");
    });
  it("admits a new personal record whose key is not a side file", async () => {
    const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "test-user" }, kind: "personal/document", key: "scratch/notes.md" });
    await expect(createPreflightRefStore().write({ action: "put", reference, expected: null, content: "saved\n", provenance }))
      .rejects.toThrow("Admission consulted");
  });
});
