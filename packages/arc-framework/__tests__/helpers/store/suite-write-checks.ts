/** Backend-neutral proofs of registered write-check admission and atomic views. */
import { expect } from "vitest";
import { HAND_EDIT_VERBS, type BrokenRule, type KindId, type WriteCheck } from "../../../src/lib/store/index.js";
import { assertion, seed, success, testProvenance, update, type SuiteContext } from "./suite-tools.js";

function checked(context: SuiteContext, kind: KindId, check: WriteCheck): SuiteContext {
  return { ...context, registration: { ...context.registration,
    create: () => context.registration.create({ [kind]: {
      parser: (content: string) => ({ success: true, data: { content } }), check,
    } }),
  } };
}
function broken(rule: string): BrokenRule {
  return { rule, condition: `Broken ${rule}`, remedy: { text: `Repair ${rule}, then retry` } };
}

/** Register the common checks required of a fixture declaring write-check support.
 * @param context - Item registration and backend declarations.
 * @returns Nothing after applicable assertions or reasoned skips are registered.
 */
export function registerWriteCheckAssertions(context: SuiteContext): void {
  const reason = context.registration.declarations.runsWriteChecks ? undefined : "This fixture runs no write checks.";
  const kind = "personal/document";
  assertion(checked(context, kind, async () => [broken("z.test"), broken("a.test")]), "personal",
    "write-check-refuses-before-publication", async (fixture) => {
      const reference = fixture.reference(kind);
      const before = await fixture.settle();
      expect(await fixture.store.write({ action: "put", reference, expected: null,
        content: fixture.content(reference), provenance: testProvenance })).toMatchObject({
        status: "refused", refusal: { code: "record-malformed", reference, rule: "a.test",
          condition: "Broken a.test (1 other (record, rule) pairs broken.)", remedy: { text: "Repair a.test, then retry" } },
      });
      expect(await fixture.settle()).toBe(before);
      expect(await fixture.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    }, reason);
  assertion(checked(context, kind, async () => [broken("z.test"), broken("a.test")]), "personal",
    "batch-check-selects-rule-then-record-and-counts-pairs", async (fixture) => {
      const first = fixture.reference(kind, "two"), second = fixture.reference(kind);
      const before = await fixture.settle();
      expect(await fixture.store.batch({ writes: [first, second].map((reference) => ({ action: "put", reference,
        expected: null, content: fixture.content(reference) })), provenance: testProvenance })).toMatchObject({
        status: "refused", refusal: { code: "record-malformed", reference: first, rule: "a.test",
          condition: "Broken a.test (3 other (record, rule) pairs broken.)" },
      });
      expect(await fixture.settle()).toBe(before);
      for (const reference of [first, second]) expect(await fixture.store.read({ reference })).toMatchObject({ status: "refused" });
    }, reason);
  for (const verb of [...HAND_EDIT_VERBS, "handoff", "custom-verb"]) {
    const expected = HAND_EDIT_VERBS.some((handEdit) => handEdit === verb) ? { kind: "hand-edit" }
      : { kind: "verb", verb };
    assertion(checked(context, kind, async ({ writer }) => JSON.stringify(writer) === JSON.stringify(expected)
      ? [] : [broken("writer.test")]), "personal", `write-check-writer:${verb}`, async (fixture) => {
      const reference = fixture.reference(kind);
      success(await fixture.store.write({ action: "put", reference, expected: null,
        content: fixture.content(reference), provenance: { verb, lifecycleAction: "edit" } }));
      expect(success(await fixture.store.read({ reference })).content).toBe(fixture.content(reference));
    }, reason);
  }
  registerViewAssertions(context, reason);
}

function registerViewAssertions(context: SuiteContext, reason?: string): void {
  const kind = "work-item/meta";
  assertion(checked(context, kind, async ({ before, after, reference, prior, next }) => {
    if (prior !== undefined) return [];
    const lookup = { kind: "slug" as const, slug: reference.owner.name };
    expect(await before.lookup(lookup)).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await after.lookup(lookup)).toMatchObject({ status: "ok", result: { reference } });
    expect(await before.read({ reference })).toMatchObject({ status: "refused" });
    expect(success(await after.read({ reference })).content).toBe(next?.content);
    expect(next?.fields).toEqual({ content: next?.content });
    const old = success(await before.list({ family: "work-item", kind }));
    expect(old.status).toBe("absent");
    const changed = success(await after.list({ family: "work-item", kind }));
    expect(changed).toMatchObject({ status: "complete", records: expect.any(Array) });
    if (changed.status !== "complete") throw new Error("Prepared batch is absent");
    expect(changed.records).toHaveLength(2);
    return [];
  }), "work-item", "write-check-before-and-after-cover-the-whole-batch", async (fixture) => {
    const writes = ["one", "two"].map((suffix) => {
      const reference = fixture.reference(kind, suffix);
      return { action: "put" as const, reference, expected: null, content: fixture.content(reference),
        placement: { kind: "active" as const } };
    });
    expect(success(await fixture.store.batch({ writes, provenance: testProvenance })).writes).toHaveLength(2);
  }, reason);
  const mergingReason = reason ?? (context.registration.declarations.mergesConcurrentWrites ? undefined
    : "This fixture does not merge concurrent writes.");
  assertion(checked(context, "personal/document", async ({ prior, next }) => {
    if (prior?.content.includes("current opening")) {
      expect(prior?.content).toBe("current opening\nbase\nclosing\n");
      expect(next?.content).toBe("current opening\nbase\nincoming closing\n");
      expect(next?.fields).toEqual({ content: next?.content });
    }
    return [];
  }), "personal", "stale-write-check-receives-merged-stored-content", async (fixture) => {
    const base = await seed(fixture, fixture.reference("personal/document"));
    success(await fixture.store.write(update(fixture, base, "current opening\nbase\nclosing\n")));
    const merged = success(await fixture.store.write(update(fixture, base, "opening\nbase\nincoming closing\n")));
    expect(merged.conflicts).toEqual([]);
    expect(success(await fixture.store.read({ reference: base.reference })).content)
      .toBe("current opening\nbase\nincoming closing\n");
  }, mergingReason);
}
