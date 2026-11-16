/** Retirement feasibility tells an edit's own refusal from evidence it could not read. */
import { describe, expect, it } from "vitest";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences, RecordVersionSchema } from "../../../../src/lib/store/identity.js";
import type { RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import { projectionAdmissionConflict } from "../../../../src/lib/store/projection/preparation-view.js";
import { observeProjectionReads } from "../../../../src/lib/store/projection/read-observation.js";
import { markStoreRefusal } from "../../../../src/lib/store/projection/refusal-mark.js";
import { ignoreRefusalMark, markedRemovalRefusal, projectionFeasibilityRefusal, retirementRefusal, unobservedMarkDetail,
  unresolvedRemovalConflicts } from "../../../../src/lib/store/projection/removal-verdict.js";
import { missingMintedMetadataMark } from "../../../../src/lib/store/projection/adoption-verdict.js";
import { removalCopyRefusal } from "../../../../src/lib/store/projection/removal-persist-asides.js";
import type { StoreRefusal } from "../../../../src/lib/store/refusal.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";

const CHECKOUT = "/work/target";
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
      result: { answer: "refused", entry: { ...entry, refused: mark }, mark } }, CHECKOUT, "notes.md", "remove"))
      .toEqual({ kind: "would-refuse", remedy: retirementRefusal(CHECKOUT, "notes.md", mark, "remove") });
  });

  it("keeps an edit whose base could not be read unobservable", () => {
    const readRefusal: StoreRefusal = { code: "state-unresolvable", class: "recoverable", reference, historyRefs: [],
      condition: "The base is unreadable.", remedy: { text: "Restore readable record history, then retry." } };
    expect(projectionFeasibilityRefusal({ kind: "held", readRefusal, diagnostic: markStoreRefusal(readRefusal),
      result: { answer: "pending", entry: { ...entry, pending: true } } }, CHECKOUT, "notes.md", "remove"))
      .toEqual({ kind: "unobservable", detail: "notes.md in /work/target: The base is unreadable. Restore readable record history" });
  });

  it("keeps a native refusal unobservable, naming the path, its checkout, the condition and the repair", () => {
    const mark = { reason: "The projection index is being published.", remedy: { text:
      "Let the command publishing the projection index at /work/target finish, or run arc save there to rebuild it, then retry." } };
    expect(projectionFeasibilityRefusal({ kind: "refused", mark, nativeRefusal: true }, CHECKOUT, "notes.md", "release")).toEqual({
      kind: "unobservable", detail: "notes.md in /work/target: The projection index is being published. "
        + "Let the command publishing the projection index at /work/target finish, or run arc save there to rebuild it" });
  });
});

describe("the retirement a shared remedy asks to retry", () => {
  const conflict = recordReferences["personal/document"](owner, "scratch/other.md");
  it.each([["remove", "removal"], ["release", "release"]] as const)("names %s's own retry", (disposition, name) => {
    expect(projectionFeasibilityRefusal({ kind: "held", result: { answer: "pending", entry: { ...entry, pending: true } } },
      CHECKOUT, "notes.md", disposition)).toEqual({ kind: "would-refuse",
      remedy: { text: `Let notes.md finish settling, then run arc save from ${CHECKOUT} and retry ${name}.` } });
    expect(unresolvedRemovalConflicts(CHECKOUT, "notes.md", [conflict], [], disposition)).toEqual({ kind: "would-refuse",
      remedy: { text: `Resolve the conflicts in notes.md by hand, then run arc save from ${CHECKOUT} and retry ${name}.` } });
    expect(removalCopyRefusal({ kind: "moved-on", entry, path: "notes.md", copy: "notes.md.aside" }, CHECKOUT, "notes.md.aside", 0, disposition))
      .toEqual({ text: `Recover anything wanted from notes.md.aside in ${CHECKOUT}, then delete that copy explicitly and retry ${name}.` });
    expect(removalCopyRefusal({ kind: "kept", entry, answer: "unsettled" }, CHECKOUT, "notes.md.aside", Number.MAX_SAFE_INTEGER, disposition))
      .toEqual({ text: `Let notes.md.aside finish saving, then run arc save from ${CHECKOUT} and retry ${name}.` });
  });
});

describe("a retirement a shared mark refuses", () => {
  it("names the path, its checkout, an adoption mark's condition and repair, and the retirement, without adoption's retry", () => {
    expect(retirementRefusal(CHECKOUT, "active/current/notes.md", missingMintedMetadataMark(), "remove")).toEqual({ text:
      "active/current/notes.md in /work/target blocks removal: The stub was created, but its authored metadata file is missing. "
      + "Restore the authored metadata file. Then retry removal." });
  });

  it("drops a producer's closing retry sentence and keeps the repair before it", () => {
    const mark = { reason: "The prospective stub's metadata does not parse: missing H1",
      remedy: { text: "Repair the metadata's H1 and core table, or create the stub explicitly. Run arc stub plan. Then retry adoption." } };
    expect(retirementRefusal(CHECKOUT, "backlog/plan/meta-plan.md", mark, "release")).toEqual({ text:
      "backlog/plan/meta-plan.md in /work/target blocks release: The prospective stub's metadata does not parse: missing H1. "
      + "Repair the metadata's H1 and core table, or create the stub explicitly. Run arc stub plan. Then retry release." });
  });

  it.each([
    ["Add `/.arc/user/` to .gitignore, then run the command again.", "Add `/.arc/user/` to .gitignore."],
    ["The projection writes into no root until the guard passes; run the command again.", "The projection writes into no root until the guard passes."],
    ["Replace the policy with a regular file, then commit it so every worktree holds it and retry the command.",
      "Replace the policy with a regular file, then commit it so every worktree holds it."],
  ])("names the ignore guard's repair %j without the command's own rerun", (remedy, repair) => {
    expect(retirementRefusal(CHECKOUT, ".arc/user/andrew/scratch/one.md", ignoreRefusalMark("not-ignored", remedy), "remove")).toEqual({
      text: `.arc/user/andrew/scratch/one.md in /work/target blocks removal: Projection ignore guard refused: not-ignored. ${repair} Then retry removal.` });
  });

  it.each([
    ["Inspect the work item's current role, then reproject or repair the metadata before retrying adoption.",
      "Inspect the work item's current role, then reproject or repair the metadata."],
    ["Inspect the stored stub and repair its creation result before retrying adoption.", "Inspect the stored stub and repair its creation result."],
    ["Inspect and repair the named ownership or checkout evidence, then retry the edit.", "Inspect and repair the named ownership or checkout evidence."],
    ["Use the record's owning verb, or repair its lifecycle metadata before retrying the edit.", "Use the record's owning verb, or repair its lifecycle metadata."],
    ["Repair the record's ownership and lifecycle metadata, then retry the edit.", "Repair the record's ownership and lifecycle metadata."],
    ["Release the content writer before retrying the edit.", "Release the content writer."],
    ["Run arc save to pull the named history and retry this edit. Restore readable record history, then retry.",
      "Run arc save to pull the named history. Restore readable record history."],
    ["Use the lifecycle or Class verb that owns the change, then retry the remaining hand edit.", "Use the lifecycle or Class verb that owns the change."],
  ])("names a producer's repair %j without its own adoption or edit retry", (remedy, repair) => {
    expect(markedRemovalRefusal(CHECKOUT, "active/plan/meta-plan.md", { reason: "The record is held.", remedy: { text: remedy } }, "release"))
      .toEqual({ kind: "would-refuse", remedy: { text: `active/plan/meta-plan.md in /work/target blocks release: The record is held. ${repair} Then retry release.` } });
  });

  it("keeps the repair's runnable command", () => {
    const mark = { reason: "This file belongs to blair.", remedy: { text: "Run arc materialize plan, then apply the edit in its checkout.",
      argv: ["arc", "materialize", "plan"] } };
    expect(retirementRefusal(CHECKOUT, "active/plan/notes.md", mark, "remove")).toEqual({ argv: ["arc", "materialize", "plan"],
      text: "active/plan/notes.md in /work/target blocks removal: This file belongs to blair. "
        + "Run arc materialize plan, then apply the edit in its checkout. Then retry removal." });
  });

  it("keeps a read failure's condition beside its repair in the observation's detail", () => {
    const mark = { reason: "Cannot read prospective metadata backlog/plan/meta-plan.md: EACCES",
      remedy: { text: "Restore readable metadata at the named path, then retry adoption." } };
    expect(unobservedMarkDetail(CHECKOUT, "backlog/plan/notes.md", mark)).toBe("backlog/plan/notes.md in /work/target: "
      + "Cannot read prospective metadata backlog/plan/meta-plan.md: EACCES. Restore readable metadata at the named path");
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
