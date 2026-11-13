/** Retirement feasibility tells an edit's own refusal from evidence it could not read. */
import { describe, expect, it } from "vitest";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences, RecordVersionSchema } from "../../../../src/lib/store/identity.js";
import type { RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import { projectionAdmissionConflict } from "../../../../src/lib/store/projection/preparation-view.js";
import { observeProjectionReads } from "../../../../src/lib/store/projection/read-observation.js";
import { markStoreRefusal } from "../../../../src/lib/store/projection/refusal-mark.js";
import { projectionFeasibilityRefusal } from "../../../../src/lib/store/projection/removal-verdict.js";
import type { StoreRefusal } from "../../../../src/lib/store/refusal.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";

const owner = OwnerIdentitySchema.parse({ type: "person", name: "andrew" });
const reference = recordReferences["personal/document"](owner, "scratch/notes.md");
const entry: RecordEntry = { kind: "record", reference, stat: null, written: "a".repeat(40),
  base: { blob: "a".repeat(40), version: RecordVersionSchema.parse("v1") }, markers: null, notices: [], unshown: [],
  protected: false, changed: true, pending: false, withheld: false, refused: null, persisted: null, inProgress: null, copies: [] };

describe("retirement feasibility of a held preparation", () => {
  it("answers a refusal the preparation reached on what it read as the edit's own", () => {
    const refusal = projectionAdmissionConflict(reference, "The indexed record changed identity or role.");
    const mark = markStoreRefusal(refusal);
    expect(projectionFeasibilityRefusal({ kind: "held", refusal,
      result: { answer: "refused", entry: { ...entry, refused: mark }, mark } }, "notes.md"))
      .toEqual({ kind: "would-refuse", remedy: mark.remedy });
  });

  it("keeps an edit whose base could not be read unobservable", () => {
    const readRefusal: StoreRefusal = { code: "state-unresolvable", class: "recoverable", reference, historyRefs: [],
      condition: "The base is unreadable.", remedy: { text: "Restore readable record history, then retry." } };
    expect(projectionFeasibilityRefusal({ kind: "held", readRefusal, diagnostic: markStoreRefusal(readRefusal),
      result: { answer: "pending", entry: { ...entry, pending: true } } }, "notes.md"))
      .toEqual({ kind: "unobservable", detail: "Restore readable record history, then retry." });
  });
});

describe("a check's read observation", () => {
  const ambiguous = (candidates: readonly typeof reference[]): StoreRefusal => ({ code: "ambiguous-match", class: "recoverable",
    candidates: [...candidates], condition: "Two records answer this name.", remedy: { text: "Choose another name." } });

  it.each([[[], true], [["ambiguous-match"], false]] as const)(
    "with answered lookups %j, retains an ambiguous lookup as a failed read: %s", async (answeredLookups, retained) => {
      const fixture = createReferenceFixture();
      const refusal = ambiguous([reference, recordReferences["personal/document"](owner, "scratch/other.md")]);
      const before = new Proxy(fixture.store, { get(target, key) {
        if (key === "lookup") return () => Promise.resolve({ status: "refused", refusal });
        const value: unknown = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      } });
      const observed = observeProjectionReads(before, { answeredLookups });
      expect(await observed.store.lookup({ kind: "slug", slug: SlugSchema.parse("notes") })).toEqual({ status: "refused", refusal });
      expect(observed.nativeFailure()).toEqual(retained ? refusal : undefined);
    });

  it("retains an answered code from an ordinary read", async () => {
    const fixture = createReferenceFixture();
    const refusal = ambiguous([reference, recordReferences["personal/document"](owner, "scratch/other.md")]);
    const before = new Proxy(fixture.store, { get(target, key) {
      if (key === "read") return () => Promise.resolve({ status: "refused", refusal });
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    const observed = observeProjectionReads(before, { answeredLookups: ["ambiguous-match"] });
    await observed.store.read({ reference });
    expect(observed.nativeFailure()).toEqual(refusal);
  });
});
