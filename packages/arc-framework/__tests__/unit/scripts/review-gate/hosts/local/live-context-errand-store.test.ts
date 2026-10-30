/** Native review and response bind the checkout's exact project-scoped Errand claim. */
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../../helpers/store/review-checkout.js";
import { TransientIdentityRecordSchema } from "../../../../../../src/lib/errand/identity-record.js";
import { readLocalReviewLiveContext } from "../../../../../../src/scripts/review-gate/hosts/local/live-context.js";
import { createRespondDependencies } from "../../../../../../src/scripts/review-gate/runtime/respond-composition.js";

import { ListingDiagnosticSchema } from "../../../../../../src/lib/store/read.js";
import type { Store } from "../../../../../../src/lib/store/contract.js";
import { StoreRefusalSchema } from "../../../../../../src/lib/store/refusal.js";

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
  await expect(createRespondDependencies(input).resolveActiveErrand()).rejects.toThrow(detail);
  missing = false;
  await resolves();
});
