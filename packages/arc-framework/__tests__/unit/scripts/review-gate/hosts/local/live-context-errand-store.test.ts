/** Native review and response bind the checkout's exact project-scoped Errand claim. */
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../../helpers/store/review-checkout.js";
import { TransientIdentityRecordSchema } from "../../../../../../src/lib/errand/identity-record.js";
import { readLiveErrandClaimId, readLocalReviewLiveContext } from "../../../../../../src/scripts/review-gate/hosts/local/live-context.js";
import { createRespondDependencies } from "../../../../../../src/scripts/review-gate/runtime/respond-composition.js";

import { ListingDiagnosticSchema } from "../../../../../../src/lib/store/read.js";
import type { Store } from "../../../../../../src/lib/store/contract.js";
import { StoreRefusalSchema } from "../../../../../../src/lib/store/refusal.js";
import { describeRecordConflicts } from "../../../../../../src/lib/store/conflict-diagnostics.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../../../src/lib/store/identity.js";
import { ReviewOwnerSelectionError } from "../../../../../../src/lib/store/kinds/review/errors.js";

async function fixture(state: "open" | "awaiting-merge" = "open") {
  const harness = createReviewHarness();
  await harness.seedProject("123e4567-e89b-42d3-a456-426614174099");
  const branch = "chore/repair", claimId = "1".repeat(32);
  const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand",
    slug: "repair", claimId, intent: "Repair one issue", owner: "test-user", origin: "description", originEntry: null,
    branch, state, savedHead: null, changeRequest: state === "open" ? null : {
      repositoryRef: "owner/repo", hostRef: "github.com", baseRef: "main", headRef: branch, headSha: "a".repeat(40),
    }, createdAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z" });
  if (record.kind !== "errand" || record.purpose !== "errand") throw new Error("Expected ordinary Errand");
  const primary = await harness.seedErrand(record);
  const checkout = await createReviewCheckout(harness, { script: [
    { match: ["show-ref", "--exists", "refs/arc/user/test-user/errands"], responses: [{ failure: { exitCode: 2 } }] },
  ] });
  await checkout.occupy(branch, { kind: "errand", slug: record.slug, claimId });
  return { ...checkout, workItem: primary.reference.owner, branch, claimId, primary };
}

it.each(["open", "awaiting-merge"] as const)("reads an %s claim for review and preserves response state filtering", async (state) => {
  const h = await fixture(state);
  onTestFinished(h.cleanup);
  expect(await readLocalReviewLiveContext(h)).toMatchObject({ context: {
    workUnit: null, errand: { identity: "repair", claimId: h.claimId },
  } });
  expect(await createRespondDependencies(h).resolveActiveErrand()).toEqual(state === "open"
    ? { key: "repair", claimId: h.claimId, branch: h.branch } : null);
});

it.each(["lookup", "read"] as const)("names the exact Errand when its %s refuses and resumes after repair", async (boundary) => {
  const h = await fixture();
  onTestFinished(h.cleanup);
  let unavailable = true;
  const store = Object.create(h.store) as Store;
  const refusal = { status: "refused" as const, refusal: StoreRefusalSchema.parse({ code: "namespace-corrupt",
    class: "terminal", namespace: "work-item", condition: "Exact claim reader is unavailable.",
    remedy: { text: "Restore the exact claim reader, then retry." } }) };
  store.lookup = async input => boundary === "lookup" && unavailable && input.kind === "claim" ? refusal : h.store.lookup(input);
  store.read = async input => boundary === "read" && unavailable && input.reference.kind === "work-item/record" ? refusal : h.store.read(input);
  const input = { ...h, store };
  const detail = /Errand repair.*Exact claim reader is unavailable.*Restore the exact claim reader/u;
  await expect(readLocalReviewLiveContext(input)).rejects.toThrow(detail);
  await expect(readLocalReviewLiveContext(input)).rejects.toMatchObject({ refusal: { code: "namespace-corrupt", class: "terminal" } });
  await expect(createRespondDependencies(input).resolveActiveErrand()).rejects.toThrow(detail);
  unavailable = false;
  expect(await readLocalReviewLiveContext(input)).toMatchObject({ context: { errand: { identity: "repair", claimId: h.claimId } } });
  expect(await createRespondDependencies(input).resolveActiveErrand()).toEqual({ key: "repair", claimId: h.claimId, branch: h.branch });
});

it("raises a refused claim read from the live Errand claim match whole, and matches the claim after repair", async () => {
  const h = await fixture();
  onTestFinished(h.cleanup);
  let unavailable = true;
  const store = Object.create(h.store) as Store;
  store.lookup = async input => unavailable && input.kind === "claim" ? { status: "refused", refusal: StoreRefusalSchema.parse({
    code: "namespace-corrupt", class: "terminal", namespace: "work-item", condition: "Exact claim reader is unavailable.",
    remedy: { text: "Restore the exact claim reader, then retry." } }) } : h.store.lookup(input);
  const input = { ...h, store };
  await expect(readLiveErrandClaimId(input, h.claimId)).rejects.toMatchObject({ offBranch: true,
    refusal: { code: "namespace-corrupt", class: "terminal" } });
  unavailable = false;
  expect(await readLiveErrandClaimId(input, h.claimId)).toBe(h.claimId);
  expect(await readLiveErrandClaimId(input, "2".repeat(32))).toBeNull();
});

it("refuses a conflicted Errand claim as the store's typed conflict refusal, naming its records, and reads once resolved", async () => {
  const h = await fixture();
  onTestFinished(h.cleanup);
  let conflicted = true;
  const store = Object.create(h.store) as Store;
  store.read = async input => {
    const read = await h.store.read(input);
    return conflicted && input.reference.kind === "work-item/record" && read.status === "ok"
      ? { status: "ok", result: { ...read.result, conflicts: [h.primary.reference] } } : read;
  };
  const input = { ...h, store };
  await expect(readLocalReviewLiveContext(input)).rejects.toMatchObject({ offBranch: true, refusal: {
    code: "record-malformed", class: "recoverable", reference: h.primary.reference, rule: "review.errand-claim-conflict" },
  message: `Errand repair has unresolved conflicts.${describeRecordConflicts([h.primary.reference])}` });
  conflicted = false;
  expect(await readLocalReviewLiveContext(input)).toMatchObject({ context: { errand: { identity: "repair", claimId: h.claimId } } });
});

it("keeps exact claims usable beside malformed entries and refuses an incomplete miss until repair", async () => {
  const h = await fixture();
  onTestFinished(h.cleanup);
  let missing = false;
  const store = Object.create(h.store) as Store;
  const diagnostic = ListingDiagnosticSchema.parse({ kind: "malformed", key: "damaged-errand",
    condition: "Errand content is malformed.", remedy: { text: "Repair damaged-errand, then retry." } });
  store.list = async input => {
    const listed = await h.store.list(input);
    if (input.kind !== "work-item/record" || listed.status !== "ok" || listed.result.status !== "complete") return listed;
    return { status: "ok", result: { ...listed.result, records: missing ? [] : listed.result.records,
      missed: true, diagnostics: [diagnostic] } };
  };
  store.lookup = async input => missing && input.kind === "claim"
    ? { status: "refused", refusal: StoreRefusalSchema.parse({ code: "not-found", class: "recoverable", lookup: input,
      condition: "Claim was not found.", remedy: { text: "Restore the claim, then retry." } }) }
    : h.store.lookup(input);
  const input = { ...h, store };
  const resolves = async () => {
    expect(await readLocalReviewLiveContext(input)).toMatchObject({ context: { errand: { identity: "repair", claimId: h.claimId } } });
    expect(await createRespondDependencies(input).resolveActiveErrand()).toEqual({ key: "repair", claimId: h.claimId, branch: h.branch });
  };
  await resolves();
  missing = true;
  const detail = /Errand repair.*damaged-errand.*Errand content is malformed.*Repair damaged-errand/u;
  await expect(readLocalReviewLiveContext(input)).rejects.toThrow(detail);
  await expect(readLiveErrandClaimId(input, h.claimId)).rejects.toMatchObject({ offBranch: true, refusal: {
    code: "record-malformed", class: "recoverable", rule: "review.errand-inventory-incomplete",
    remedy: { text: "Repair damaged-errand, then retry." } } });
  await expect(createRespondDependencies(input).resolveActiveErrand()).rejects.toThrow(detail);
  missing = false;
  await resolves();
});

it.each(["refused", "unreadable"] as const)("raises a %s Errand inventory behind a missing claim from the live claim match, and reads the claim after repair", async (failure) => {
  const h = await fixture();
  onTestFinished(h.cleanup);
  let inventoryFails = true, claimMissing = true;
  const store = Object.create(h.store) as Store;
  const remedy = { text: "Restore the Errand inventory, then retry." };
  store.list = async input => !inventoryFails || input.kind !== "work-item/record" ? h.store.list(input)
    : failure === "refused" ? { status: "refused", refusal: StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal",
      namespace: "work-item", condition: "Errand inventory is corrupt.", remedy }) }
    : { status: "ok", result: { status: "unreadable", condition: "Errand inventory cannot be read.", remedy } };
  store.lookup = async input => claimMissing && input.kind === "claim"
    ? { status: "refused", refusal: StoreRefusalSchema.parse({ code: "not-found", class: "recoverable", lookup: input,
      condition: "Claim was not found.", remedy: { text: "Restore the claim, then retry." } }) }
    : h.store.lookup(input);
  const input = { ...h, store };
  await expect(readLiveErrandClaimId(input, h.claimId)).rejects.toMatchObject({ offBranch: true,
    message: expect.stringMatching(/^Errand repair \(1{32}\): Errand inventory (is corrupt|cannot be read)\. Restore the Errand inventory/u),
    refusal: failure === "refused" ? { code: "namespace-corrupt", class: "terminal" }
      : { code: "record-malformed", class: "recoverable", rule: "review.errand-inventory-unreadable", remedy } });
  inventoryFails = false;
  expect(await readLiveErrandClaimId(input, h.claimId)).toBeNull();
  claimMissing = false;
  expect(await readLiveErrandClaimId(input, h.claimId)).toBe(h.claimId);
});

it("raises a branch link naming absent work-unit metadata from the live claim match, and matches the claim after repair", async () => {
  const h = await fixture();
  onTestFinished(h.cleanup);
  let dangling = true;
  const store = Object.create(h.store) as Store;
  const absent = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "repair",
    uid: "123e4567-e89b-42d3-a456-426614174000" }));
  store.lookup = async input => dangling && input.kind === "ref" && input.ref === h.branch
    ? { status: "ok", result: { reference: absent } } : h.store.lookup(input);
  const input = { ...h, store };
  const refused = readLiveErrandClaimId(input, h.claimId);
  await expect(refused).rejects.toBeInstanceOf(ReviewOwnerSelectionError);
  await expect(refused).rejects.toMatchObject({ code: "corrupt-state",
    condition: expect.stringMatching(/linked work-unit metadata is missing/u) });
  dangling = false;
  expect(await readLiveErrandClaimId(input, h.claimId)).toBe(h.claimId);
});
