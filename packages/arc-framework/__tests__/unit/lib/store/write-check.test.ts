/** Provenance defines writer authority independently of record content. */
import { describe, expect, it } from "vitest";
import * as checks from "../../../../src/lib/store/write-check.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";

const owner = OwnerIdentitySchema.parse({ type: "project", name: "registry" });
const reference = (key: string) => recordReferences["project-registry/counter"](owner, key);
const broken = (rule: string): checks.BrokenRule => ({ rule, condition: `Broken ${rule}.`, remedy: { text: `Repair ${rule}.` } });

describe("write-check writer derivation", () => {
  it.each(["write-back", "save"])("treats %s as a hand edit", (verb) => {
    expect(checks.deriveWriteCheckWriter({ verb, lifecycleAction: "edit" })).toEqual({ kind: "hand-edit" });
  });
  it.each(["activate", "sync", "save-draft"])("retains %s as a verb writer", (verb) => {
    expect(checks.deriveWriteCheckWriter({ verb, lifecycleAction: "reconcile" })).toEqual({ kind: "verb", verb });
  });
});

describe("write-check refusal composition", () => {
  it("retains a single violation's rule, record, condition, and remedy", () => {
    const rule = broken("meta.shape");
    expect(checks.composeWriteCheckRefusal([{ reference: reference("one"), rules: [rule] }])).toEqual({
      code: "record-malformed", class: "recoverable", rule: rule.rule, reference: reference("one"),
      condition: `${rule.condition} (0 other (record, rule) pairs broken.)`, remedy: rule.remedy,
    });
  });
  it("chooses the first identifier instead of the first check result", () => {
    expect(checks.composeWriteCheckRefusal([{ reference: reference("one"), rules: [broken("meta.z"), broken("meta.a")] }]))
      .toMatchObject({ rule: "meta.a", remedy: { text: "Repair meta.a." } });
  });
  it("orders identifiers by UTF-8 bytes rather than UTF-16 code units", () => {
    expect(checks.composeWriteCheckRefusal([{ reference: reference("one"), rules: [broken("meta.😀"), broken("meta.\uE000")] }]))
      .toMatchObject({ rule: "meta.\uE000" });
  });
  it("chooses the first record in write order that breaks the selected rule", () => {
    expect(checks.composeWriteCheckRefusal([
      { reference: reference("one"), rules: [broken("meta.z")] },
      { reference: reference("two"), rules: [broken("meta.a")] },
      { reference: reference("three"), rules: [broken("meta.a")] },
    ])).toMatchObject({ rule: "meta.a", reference: reference("two") });
  });
  it("counts the other violations across every record and rule", () => {
    expect(checks.composeWriteCheckRefusal([
      { reference: reference("one"), rules: [broken("meta.a"), broken("meta.z")] },
      { reference: reference("two"), rules: [broken("meta.a"), broken("meta.b"), broken("meta.c")] },
    ])).toMatchObject({ condition: "Broken meta.a. (4 other (record, rule) pairs broken.)" });
  });
  it("admits an empty set or records with no broken rules", () => {
    expect(checks.composeWriteCheckRefusal([])).toBeUndefined();
    expect(checks.composeWriteCheckRefusal([{ reference: reference("one"), rules: [] }])).toBeUndefined();
  });
});
