/** Production-registered link checks admit or refuse atomic reference-store writes. */
import { describe, expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { createKindRegistry } from "../../../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../src/lib/store/kinds/registrations.js";

const provenance = { verb: "save", lifecycleAction: "edit" };

async function fixture() {
  const harness = createLifecycleHarness();
  const meta = await harness.seedMeta("example");
  const notes = recordReferences["work-item/notes"](meta.reference.owner);
  return { ...harness, meta, notes };
}

describe("record link admission", () => {
  it.each([
    ["pause", "[x](relative.md)", "links.relative-in-movable"],
    ["save", "[x](/.arc/active)", "links.into-projection"],
    ["write-back", "[x][missing]", "links.undefined-reference"],
  ])("refuses a %s write introducing %s and accepts its corrected retry", async (verb, content, rule) => {
    const { store, notes } = await fixture();
    expect(await store.write({ action: "put", reference: notes, expected: null, content,
      provenance: { verb, lifecycleAction: "edit" } })).toMatchObject({
      status: "refused", refusal: { code: "record-malformed", rule, remedy: { text: expect.stringContaining("save again") } },
    });
    expect(await store.read({ reference: notes })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await store.write({ action: "put", reference: notes, expected: null, content: "[guide](/README.md)", provenance }))
      .toMatchObject({ status: "ok" });
  });
  it("refuses a violating batch without partially publishing valid companion writes", async () => {
    const { store, notes, meta } = await fixture();
    const draft = recordReferences["work-item/draft"](meta.reference.owner);
    expect(await store.batch({ writes: [
      { action: "put", reference: draft, expected: null, content: "Valid draft." },
      { action: "put", reference: notes, expected: null, content: "[x](relative.md)" },
    ], provenance })).toMatchObject({ status: "refused", refusal: { rule: "links.relative-in-movable" } });
    expect(await store.read({ reference: draft })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await store.batch({ writes: [
      { action: "put", reference: draft, expected: null, content: "Valid draft." },
      { action: "put", reference: notes, expected: null, content: "`relative.md`" },
    ], provenance })).toMatchObject({ status: "ok" });
  });
  it.each(["write", "batch"] as const)("refuses bracketed undefined references through %s and permits corrected retry", async method => {
    for (const content of [String.raw`[a\]b][missing]`, "[a[b]c][missing]"]) {
      const { store, notes, meta } = await fixture();
      const draft = recordReferences["work-item/draft"](meta.reference.owner);
      const perform = (next: string) => method === "write"
        ? store.write({ action: "put", reference: notes, expected: null, content: next, provenance })
        : store.batch({ writes: [
          { action: "put", reference: draft, expected: null, content: "Valid draft." },
          { action: "put", reference: notes, expected: null, content: next },
        ], provenance });
      expect(await perform(content)).toMatchObject({
        status: "refused", refusal: { code: "record-malformed", rule: "links.undefined-reference",
          condition: expect.stringContaining('"MISSING" at line 1, column 1'),
          remedy: { text: expect.stringContaining("save again") } },
      });
      expect(await store.read({ reference: notes })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      expect(await store.read({ reference: draft })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      expect(await perform(`${content}\n\n[missing]: /README.md`)).toMatchObject({ status: "ok" });
    }
  });
  it("admits unrelated edits to imported historical violations", async () => {
    const { store, notes } = await fixture();
    const importer = new ReferenceBackend({ state: store.state });
    const imported = lifecycleSuccess(await importer.write({ action: "put", reference: notes, expected: null,
      content: "[x](historical.md)", provenance: { verb: "import", lifecycleAction: "import" } }));
    const checked = new ReferenceBackend({ state: importer.state, registry: createKindRegistry(PRODUCTION_REGISTRATIONS) });
    expect(await checked.write({ action: "put", reference: notes, expected: imported.version ?? null,
      content: "An unrelated typo corrected.\n\n[x](historical.md)", provenance })).toMatchObject({ status: "ok" });
  });
  it("retains original metadata admission alongside the link rules", async () => {
    const { store, meta } = await fixture();
    const result = await store.write({ action: "put", reference: meta.reference, expected: meta.version, placement: { kind: "active" },
      content: meta.content.replace("`test-user`", "`other-user`"), provenance });
    expect(result).toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "meta.verb-owned-field" } });
  });
});
