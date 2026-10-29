import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema, type WriteCheck } from "../../src/lib/store/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";

describe.each(["default", "separate"] as const)("literal leading Unicode prose in %s", layout => {
  it("retains the first codepoint when independent edits merge and publish", async () => {
    const h = await refSyncFixture(layout);
    const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" },
      kind: "personal/document", key: "literal-prose.txt" });
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "\uFEFFone\nmiddle\nthree\n", provenance: testProvenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const a = success(await h.a.store.read({ reference })), b = success(await h.b.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: a.version,
      content: "\uFEFFONE\nmiddle\nthree\n", provenance: testProvenance }));
    success(await h.b.store.write({ action: "put", reference, expected: b.version,
      content: "\uFEFFone\nmiddle\nTHREE\n", provenance: testProvenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    expect(await h.b.store.read({ reference })).toMatchObject({ status: "ok", result: { content: "\uFEFFONE\nmiddle\nTHREE\n", conflicts: [] } });
    success(await h.b.store.push()); success(await h.a.store.pull());
    expect(await h.a.store.read({ reference })).toMatchObject({ status: "ok", result: { content: "\uFEFFONE\nmiddle\nTHREE\n", conflicts: [] } });
  }, 60_000);

  it("preserves outside prose when withdrawing only locally returned entries", async () => {
    const h = await refSyncFixture(layout);
    const primary = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "returned-unicode" }, kind: "work-item/meta" }),
      content: makeMetaFixture("returned-unicode"), placement: { kind: "active" }, provenance: testProvenance }));
    const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/inbox" });
    const empty = "\uFEFF# User Inbox\n\n## Errand\n\n## Work Unit\n\n";
    const entry = "### **Returned concern**\n\n- _Id:_ `11111111`\n\nReturned concern.\n";
    const unrelated = "### **New concern**\n\n- _Id:_ `22222222`\n\nCaptured independently.\n";
    success(await h.a.store.write({ action: "put", reference, expected: null, content: empty, provenance: testProvenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const a = success(await h.a.store.read({ reference: primary.reference })), inbox = success(await h.a.store.read({ reference }));
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: a.reference, expected: a.version, content: a.content,
        placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2027-q1") } },
      { action: "put", reference, expected: inbox.version, content: empty + entry },
    ], provenance: testProvenance }));
    const remoteInbox = success(await h.b.store.read({ reference }));
    success(await h.b.store.write({ action: "put", reference, expected: remoteInbox.version,
      content: empty + unrelated, provenance: testProvenance }));
    const b = success(await h.b.store.read({ reference: primary.reference }));
    success(await h.b.store.write({ action: "put", reference: b.reference, expected: b.version, content: b.content,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: testProvenance }));
    success(await h.b.store.push());
    const pulled = success(await h.a.store.pull());
    expect(pulled.pulls.flatMap(pull => pull.notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    expect(await h.a.store.read({ reference })).toMatchObject({ status: "ok", result: { content: empty + unrelated } });
  }, 60_000);

  it.each(["current", "saved", "history", "changes"] as const)("retains the first prose codepoint in %s", async mode => {
    const f = await createRefFixture({}, layout), reference = f.reference("personal/document");
    const from = await f.settle(), content = "\uFEFFExact prose\n";
    success(await f.store.write({ action: "put", reference, expected: null, content, provenance: testProvenance }));
    const to = await f.settle();
    if (mode === "history") expect(success(await f.store.history({ reference }))).toMatchObject([{ content }]);
    else if (mode === "changes") expect(success(await f.store.changes({ from, to }))).toMatchObject([{ content }]);
    else expect(await f.store.read({ reference, ...(mode === "saved" ? { asOf: to } : {}) }))
      .toMatchObject({ status: "ok", result: { content } });
  });

  it.each([false, true])("passes exact prose to registered checks with existing=%s", async existing => {
    const f = await createRefFixture({}, layout), reference = f.reference("personal/document");
    const previous = "\uFEFFPrevious prose\n", content = "\uFEFFNext prose\n";
    const made = existing ? success(await f.store.write({ action: "put", reference, expected: null,
      content: previous, provenance: testProvenance })) : undefined;
    const check: WriteCheck = async ({ before, after, prior, next }) => {
      const seen = success(await after.read({ reference }));
      const old = existing ? success(await before.read({ reference })).content : undefined;
      return next?.content === content && seen.content === content && prior?.content === (existing ? previous : undefined)
        && old === (existing ? previous : undefined) ? [] : [{ rule: "literal-prose", condition: "The checked prose changed.",
          remedy: { text: "Preserve the original content, then retry." } }];
    };
    const registry = f.ports.registry;
    if (!registry || existing && !made?.version) throw new Error("No captured fixture state");
    const store = createRefStore({ ...f.ports, registry: { ...registry, "personal/document": { ...registry["personal/document"], check } } });
    expect(await store.write({ action: "put", reference, expected: made?.version ?? null, content,
      provenance: testProvenance })).toMatchObject({ status: "ok" });
    expect(await store.read({ reference })).toMatchObject({ status: "ok", result: { content } });
  });
});
