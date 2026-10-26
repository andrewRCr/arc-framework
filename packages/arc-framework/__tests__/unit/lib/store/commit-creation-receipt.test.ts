/** Creation metadata preserves complete backend facts and refuses advertised corruption. */
import { expect, it } from "vitest";
import { appendStoreCreationReceipt, parseStoreCreationReceipt } from "../../../../src/lib/store/commit-creation-receipt.js";
import { renderStoreCommitMessage } from "../../../../src/lib/store/commit-provenance.js";
import { BatchCreationReceiptSchema, OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/index.js";
import { canonicalize } from "../../../../src/lib/kernel/canonical/canonical-json.js";

const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "example",
  uid: "11111111-1111-4111-8111-111111111111" }));
const receipt = BatchCreationReceiptSchema.parse({ schemaVersion: 1, batchId: "batch", createdOwners: [reference] });
const message = renderStoreCommitMessage({ verb: "create", lifecycleAction: "create" }, reference, "batch");
const locus = "refs/arc/work/11111111-1111-4111-8111-111111111111@commit";

it.each([receipt, { ...receipt, createdOwners: [] }])("round-trips the complete accepted inventory $createdOwners", value => {
  const rendered = appendStoreCreationReceipt(message, value);
  expect(rendered).toBe(`${message}Arc-Creation-Receipt: ${canonicalize(value)}\n`);
  expect(parseStoreCreationReceipt(rendered, reference, locus)).toEqual({ status: "ok", result: value });
});

it("retains unavailable evidence without manufacturing a complete-none receipt", () => {
  expect(appendStoreCreationReceipt(message)).toBe(message);
  expect(parseStoreCreationReceipt(message, reference, locus)).toEqual({ status: "ok", result: undefined });
});

it("ignores subject text that spells a reserved trailer name", () => {
  const subject = renderStoreCommitMessage({ verb: "Arc-Creation-Receipt: {}", lifecycleAction: "create" }, reference, "batch");
  expect(parseStoreCreationReceipt(appendStoreCreationReceipt(subject, receipt), reference, locus))
    .toEqual({ status: "ok", result: receipt });
});

it.each([false, true])("validates advertised receipt metadata without a subject separator (valid: %s)", valid => {
  const payload = valid ? canonicalize(receipt) : "{";
  const withoutSeparator = `${message}Arc-Creation-Receipt: ${payload}\n`.replace("\n\n", "\n");
  expect(parseStoreCreationReceipt(withoutSeparator, reference, locus)).toMatchObject(valid
    ? { status: "ok", result: receipt }
    : { status: "refused", refusal: { code: "namespace-corrupt", namespace: locus,
      remedy: { text: expect.stringContaining("authentic") } } });
});

it.each([
  ["invalid JSON", "{"],
  ["unsupported version", JSON.stringify({ ...receipt, schemaVersion: 2 })],
  ["wrong batch", JSON.stringify({ ...receipt, batchId: "other" })],
  ["duplicate generation", JSON.stringify({ ...receipt, createdOwners: [reference, reference] })],
  ["invalid generation", JSON.stringify({ ...receipt, createdOwners: [{ ...reference, owner: { ...reference.owner, uid: "invalid" } }] })],
  ["noncanonical inventory", JSON.stringify({ ...receipt, createdOwners: [
    { ...reference, owner: { ...reference.owner, name: "z-last", uid: "22222222-2222-4222-8222-222222222222" } }, reference] })],
  ["unknown field", JSON.stringify({ ...receipt, guessed: true })],
])("refuses %s with a historical locus and an authentic recovery route", (_reason, payload) => {
  expect(parseStoreCreationReceipt(`${message}Arc-Creation-Receipt: ${payload}\n`, reference, locus))
    .toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: locus,
      remedy: { text: expect.stringContaining("authentic") } } });
});

it.each([
  `${message}Arc-Creation-Receipt: ${canonicalize(receipt)}\nArc-Creation-Receipt: ${canonicalize(receipt)}\n`,
  `${message}Arc-Batch: batch\nArc-Creation-Receipt: ${canonicalize(receipt)}\n`,
  `unstructured\n\nArc-Creation-Receipt: ${canonicalize(receipt)}\n`,
])("refuses duplicate or unauthenticated physical metadata", corrupted => {
  expect(parseStoreCreationReceipt(corrupted, reference, locus)).toMatchObject({ status: "refused", refusal: {
    code: "namespace-corrupt", class: "terminal", namespace: locus,
  } });
});
