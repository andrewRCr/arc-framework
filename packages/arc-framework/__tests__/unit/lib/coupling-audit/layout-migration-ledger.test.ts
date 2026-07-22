import { describe, expect, it } from "vitest";

import { digestBytes, sortByCanonicalBytes } from "../../../../src/lib/canonical/canonical-json.js";
import { canonicalJson, digestCanonicalJson } from "../../../../src/lib/coupling-audit/canonical.js";
import {
  LAYOUT_MIGRATION_CLASS_IDS,
  LayoutMigrationLedgerV1Schema,
  digestLayoutClassInventory,
  digestLayoutHitSet,
} from "../../../../src/lib/coupling-audit/layout-migration-ledger.js";
import type { CouplingClassInventory } from "../../../../src/lib/coupling-audit/types.js";

const A = "a".repeat(64);
const B = "b".repeat(64);

function source() {
  return {
    historicalResultDigest: A,
    manifestDigest: B,
    corpusFilesDigest: A,
    classInventoryDigest: B,
    selectedClassIds: LAYOUT_MIGRATION_CLASS_IDS,
    selectedHitCount: 1,
    selectedHitSetDigest: A,
  };
}

describe("layout migration ledger contract", () => {
  it("accepts the closed version-1 exact and bulk shapes", () => {
    const ledger = {
      version: 1,
      source: source(),
      exact: [{
        classId: "arc-root",
        evidenceDigest: A,
        disposition: "layout-definition",
        owner: "layout",
        reason: "Defines the semantic root.",
      }],
      bulk: [{
        id: "literal-test-evidence",
        predicate: { field: "surfaceKind", operator: "equals", values: ["test"] },
        memberSetDigest: B,
        disposition: "independent-evidence",
        owner: "tests",
        reason: "Literal expected paths remain independent.",
      }],
    };

    expect(LayoutMigrationLedgerV1Schema.parse(ledger)).toEqual(ledger);
  });

  it("rejects open vocabulary, non-canonical selected classes, and duplicate exact hit keys", () => {
    const exact = {
      classId: "arc-root",
      evidenceDigest: A,
      disposition: "layout-definition",
      owner: "layout",
      reason: "Defines the semantic root.",
    } as const;
    const base = { version: 1, source: source(), exact: [exact], bulk: [] };

    expect(LayoutMigrationLedgerV1Schema.safeParse({ ...base, unexpected: true }).success).toBe(false);
    expect(LayoutMigrationLedgerV1Schema.safeParse({
      ...base,
      source: { ...source(), selectedClassIds: [...LAYOUT_MIGRATION_CLASS_IDS].reverse() },
    }).success).toBe(false);
    expect(LayoutMigrationLedgerV1Schema.safeParse({ ...base, exact: [exact, exact] }).success).toBe(false);
    expect(LayoutMigrationLedgerV1Schema.safeParse({
      ...base,
      exact: [{ ...exact, disposition: "compatibility-shim" }],
    }).success).toBe(false);
  });
});

describe("layout migration hit-set hashing", () => {
  it("distinguishes identical evidence under different classes and ignores input order", () => {
    const keys = [["arc-root", A], ["active-placement", A]] as const;

    expect(digestLayoutHitSet(keys)).toBe(digestLayoutHitSet([...keys].reverse()));
    expect(digestLayoutHitSet(keys)).not.toBe(digestLayoutHitSet([["arc-root", A]]));
  });

  it.each([
    { name: "empty set", keys: [] },
    { name: "malformed digest", keys: [["arc-root", "sha256:bad"]] },
    { name: "unknown class", keys: [["other-root", A]] },
    { name: "duplicate tuple", keys: [["arc-root", A], ["arc-root", A]] },
  ])("rejects $name", ({ keys }) => {
    expect(() => digestLayoutHitSet(keys)).toThrow();
  });

  it("freezes artifact-LF and set-no-LF digest recipes", () => {
    const historicalResult = { version: 1, result: "historical" };
    const manifest = { version: 1, classes: [] };
    const corpusMembers = [{ locus: "package", path: "pkg/a.ts", surfaceKind: "code" }];
    const inventory: CouplingClassInventory = {
      version: 1,
      manifestDigest: A,
      corpus: { fileCount: 1, filesDigest: B },
      classes: [],
    };
    const historicalDigest = digestBytes(Buffer.from(canonicalJson(historicalResult), "utf8"))
      .slice("sha256:".length);
    const inventoryWithLf = digestBytes(Buffer.from(canonicalJson(inventory), "utf8")).slice("sha256:".length);
    const inventoryWithoutLf = digestCanonicalJson(inventory);
    expect(historicalDigest).toBe("e6d18760f4c559b81aeacfaea18799d056ff1424545c4fc6aaede9b39c564bb2");
    expect(digestCanonicalJson(manifest)).toBe("7715584f4066bfd346f4fcf0930a4a4f4e1d6b0a93bf72444ee4f282d1721950");
    expect(digestCanonicalJson(corpusMembers)).toBe("1e459c6be2ee270ee24a5d7a288c156f62f0a72940ee57b31226bb4c97e56880");
    expect(digestLayoutClassInventory(inventory)).toBe(inventoryWithLf);
    expect(digestLayoutClassInventory(inventory)).toBe(
      "ac0a065f5c09c23ffe0ca256f4c57099608b632b7a570759f4446d37966c93f0",
    );
    expect(digestLayoutClassInventory(inventory)).not.toBe(inventoryWithoutLf);

    const keys = [["active-placement", B], ["arc-root", A]] as const;
    const ordered = sortByCanonicalBytes(keys);
    const setWithLf = digestBytes(Buffer.from(canonicalJson(ordered), "utf8")).slice("sha256:".length);
    expect(digestLayoutHitSet(keys)).toBe(digestCanonicalJson(ordered));
    expect(digestLayoutHitSet(keys)).toBe("5b716d58d8e7938223296aefdef212501b3f044bc8542e338ff6e5edcc75c899");
    expect(digestLayoutHitSet(keys)).not.toBe(setWithLf);
  });
});
