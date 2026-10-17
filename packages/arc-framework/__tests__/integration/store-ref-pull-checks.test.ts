import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, createKindRegistry, RecordReferenceSchema, checkSerializationRules, type WriteCheck } from "../../src/lib/store/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";

const provenance = { verb: "user", lifecycleAction: "save" }, ref = "refs/arc/user/andrew/personal";
const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "combined.md", owner: { type: "person", name: "andrew" } });

describe.each(["default", "separate"] as const)("advisory pull checks in the %s layout", (layout) => {
  it("stores a merge that breaks write checks and reports every rule without filing conflicts", async () => {
    const h = await refSyncFixture(layout), registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const combined = "left=1\nseparator\nright=1\n", local = "left=0\nseparator\nright=1\n";
    const check: WriteCheck = async ({ reference, prior, next, before, after, writer }) => {
      if (next?.content !== combined) return [];
      expect(prior?.content).toBe(local);
      expect(success(await before.read({ reference })).content).toBe(local);
      expect(success(await after.read({ reference })).content).toBe(combined);
      expect(writer).toEqual({ kind: "verb", verb: "sync" });
      return ["personal.combination", "personal.balance"].map((rule) => ({ rule,
        condition: "The combined state needs a subsequent correction.", remedy: { text: "Change either side and save again." } }));
    };
    const checked = { ...registry, "personal/document": { ...registry["personal/document"], check } };
    const a = createRefStore({ ...h.a.ports, registry: checked }), b = createRefStore({ ...h.b.ports, registry: checked });
    success(await a.write({ action: "put", reference, expected: null, content: "left=0\nseparator\nright=0\n", provenance }));
    const base = success(await a.read({ reference }));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await b.pull());
    success(await a.write({ action: "put", reference, expected: base.version, content: "left=1\nseparator\nright=0\n", provenance }));
    success(await b.write({ action: "put", reference, expected: base.version, content: local, provenance }));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    const pulled = success(await b.pull()), notices = pulled.pulls.flatMap(({ notices }) => notices);
    expect(notices).toHaveLength(2);
    expect(notices).toEqual(expect.arrayContaining(["personal.combination", "personal.balance"].map((rule) => ({
      kind: "rule-broken", reference, rule, condition: "The combined state needs a subsequent correction.",
      remedy: { text: "Change either side and save again." },
    }))));
    const merged = success(await b.read({ reference }));
    expect(merged.content).toBe(combined);
    expect(merged.conflicts).toEqual([]);
    expect(success(await b.list({ family: "personal", kind: "personal/conflict-record" })).status).toBe("absent");
  });
  it.each(["private-key frame", "size cap"])("stores a published-state merge that crosses the %s serialization rule", async (rule) => {
    const h = await refSyncFixture(layout), baseText = "middle\n";
    const prefix = rule === "size cap" ? `${"a".repeat(600_000)}\n` : "-----BEGIN PRIVATE KEY-----\n";
    const suffix = rule === "size cap" ? `${"b".repeat(600_000)}\n` : "-----END PRIVATE KEY-----\n";
    success(await h.a.store.write({ action: "put", reference, expected: null, content: baseText, provenance }));
    const base = success(await h.a.store.read({ reference }));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    success(await h.a.store.write({ action: "put", reference, expected: base.version, content: prefix + baseText, provenance }));
    success(await h.b.store.write({ action: "put", reference, expected: base.version, content: baseText + suffix, provenance }));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    expect(success(await h.b.store.pull()).pulls[0]?.status).toBe("pulled");
    const expected = prefix + baseText + suffix;
    expect((await h.b.git(["show", `${ref}:andrew/combined.md`])).stdout).toBe(expected.trimEnd());
    expect(checkSerializationRules(reference, expected)?.rule).toBe(rule === "size cap" ? "store.size-cap" : "store.private-key");
    if (rule === "private-key frame") {
      expect(success(await h.b.store.read({ reference })).content).toBe(expected);
      return;
    }
    const listed = success(await h.b.store.list({ family: "personal", kind: "personal/document" }));
    expect(listed).toMatchObject({ status: "complete", missed: true, diagnostics: [expect.objectContaining({
      kind: "oversized", key: "andrew/combined.md",
    })] });
    expect(await h.b.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "record-malformed" } });
  });

  it("supplies unreadable prior content without parsed fields while checking the merged result", async () => {
    const h = await refSyncFixture(layout), local = "one\nseparator\nTHREE\n", merged = "ONE\nseparator\nTHREE\n";
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "one\nseparator\nthree\n", provenance }));
    const base = success(await h.a.store.read({ reference }));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    success(await h.a.store.write({ action: "put", reference, expected: base.version, content: "ONE\nseparator\nthree\n", provenance }));
    success(await h.b.store.write({ action: "put", reference, expected: base.version, content: local, provenance }));
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const b = createRefStore({ ...h.b.ports, registry: { ...registry, "personal/document": { ...registry["personal/document"],
      parser: (content) => content === merged ? { success: true, data: { parsed: true } } : { success: false, error: "Legacy shape" },
      check: async ({ prior, next }) => {
        expect(prior).toEqual({ content: local });
        expect(Object.hasOwn(prior ?? {}, "fields")).toBe(false);
        expect(next).toEqual({ content: merged, fields: { parsed: true } });
        return [];
      },
    } } });
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await b.pull());
    expect(success(await b.read({ reference })).fields).toEqual({ parsed: true });
  });

  it("checks each role of a primary replacement as removal and creation", async () => {
    const h = await refSyncFixture(layout), registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const content = makeMetaFixture("reclassified"), replacement = '{"description":"Now an errand"}';
    const checkedRole = (kind: "work-item/meta" | "work-item/record"): WriteCheck => async ({ prior, next, writer }) => {
      if (writer.kind !== "verb" || writer.verb !== "sync") return [];
      if (kind === "work-item/meta") { expect(prior?.content).toBe(content); expect(next).toBeUndefined(); }
      else { expect(prior).toBeUndefined(); expect(next?.content).toBe(replacement); }
      return [{ rule: `primary.${kind.split("/")[1]}`, condition: "The role changed during synchronization.",
        remedy: { text: "Review the new primary role." } }];
    };
    const checked = { ...registry, "work-item/meta": { ...registry["work-item/meta"], check: checkedRole("work-item/meta") },
      "work-item/record": { ...registry["work-item/record"], check: checkedRole("work-item/record") } };
    const a = createRefStore({ ...h.a.ports, registry: checked }), b = createRefStore({ ...h.b.ports, registry: checked });
    const created = success(await a.write({ action: "put", expected: null, content, placement: { kind: "active" }, provenance,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "reclassified" } }) }));
    const base = success(await a.read({ reference: created.reference }));
    const live = `refs/arc/work/${"uid" in created.reference.owner ? created.reference.owner.uid : ""}`;
    await h.a.git(["push", h.remoteName, `${live}:${live}`]);
    success(await b.pull());
    const record = RecordReferenceSchema.parse({ ...created.reference, kind: "work-item/record" });
    success(await a.write({ action: "put", reference: record, expected: base.version, content: replacement,
      placement: { kind: "active" }, provenance }));
    success(await b.write({ action: "put", expected: null, content: "Local companion.\n", provenance,
      reference: RecordReferenceSchema.parse({ ...created.reference, kind: "work-item/companion", key: "extra" }) }));
    await h.a.git(["push", h.remoteName, `${live}:${live}`]);
    const notices = success(await b.pull()).pulls.flatMap(({ notices }) => notices);
    expect(notices.map((notice) => notice.kind === "rule-broken" ? [notice.reference.kind, notice.rule] : notice.kind)).toEqual([
      ["work-item/meta", "primary.meta"], ["work-item/record", "primary.record"],
    ]);
    expect(success(await b.read({ reference: record })).content).toBe(replacement);
  });

});
