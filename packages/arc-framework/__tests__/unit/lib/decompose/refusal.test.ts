/** Decomposition refusals preserve executable repairs and whole store failures. */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DecomposeRefusalSchema, decomposeStoreRefusal, decomposeResultSchema } from "../../../../src/lib/decompose/refusal.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../../helpers/schema-assertion.js";

describe("decomposition refusals", () => {
  it.each([
    { text: "Run the extraction command.", argv: ["arc", "decompose", "origin", "--extract", "map.json"] },
    { text: "Choose another member slug in the map, then retry." },
  ])("retains a repair without inventing executable arguments: $text", (remedy) => {
    const refusal = { status: "refused", reason: "wrong-shape-mode", class: "recoverable", locus: "shape", remedy };
    expect(assertSchemaAccepts(DecomposeRefusalSchema, refusal)).toEqual(refusal);
  });

  it("validates a mode's success payload and its shared refusal", () => {
    const schema = decomposeResultSchema(z.strictObject({ members: z.array(z.string()) }));
    const success = { status: "ok", result: { members: ["new-member"] } };
    const refusal = { status: "refused", reason: "no-stored-map", class: "recoverable",
      remedy: { text: "Execute or extract an authored map first." } };
    expect(assertSchemaAccepts(schema, success)).toEqual(success);
    expect(assertSchemaAccepts(schema, refusal)).toEqual(refusal);
  });

  it.each([
    { code: "lock-held", class: "recoverable", lock: "cut-origin", condition: "Another writer owns the lock.",
      remedy: { text: "Wait for the writer, then retry.", argv: ["arc", "decompose", "origin", "--finish"] } },
    { code: "namespace-corrupt", class: "terminal", namespace: "work/origin", condition: "The namespace is corrupt.",
      remedy: { text: "Restore the namespace from a verified copy." } },
  ])("preserves the complete $code store refusal and lifts its recovery", (input) => {
    const refusal = assertSchemaAccepts(StoreRefusalSchema, input);
    const lifted = decomposeStoreRefusal(refusal);
    expect(lifted).toEqual({ status: "refused", reason: "store", class: refusal.class,
      message: refusal.condition, remedy: refusal.remedy, storeRefusal: refusal });
    expect(assertSchemaAccepts(DecomposeRefusalSchema, lifted)).toEqual(lifted);
  });

  it.each([
    { class: "terminal" },
    { remedy: { text: "Ignore the original store repair." } },
  ])("refuses a store envelope that rewrites its lifted recovery: %j", (change) => {
    const refusal = assertSchemaAccepts(StoreRefusalSchema, { code: "lock-held", class: "recoverable",
      condition: "Another writer holds the lock.", lock: "cut-origin", remedy: { text: "Wait and retry." } });
    assertSchemaRefuses(DecomposeRefusalSchema, { ...decomposeStoreRefusal(refusal), ...change });
  });
});
