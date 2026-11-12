/** Review commands report a native typed refusal with its code and remedy, and an in-repo store refusal as before. */
import { expect, it } from "vitest";
import { reviewCommandError } from "../../../src/handlers/review-handler-errors.js";
import { StoreRefusalError } from "../../../src/lib/store/refusal-error.js";
import { spineRemedy } from "../../../src/scripts/integration/spine-refusal.js";
import { prePublicationRemedy, ReviewCommandErrorEnvelopeSchema, ReviewCommandModeSchema }
  from "../../../src/scripts/review-gate/core/review-command-envelope.js";
import type { StoreRefusal } from "../../../src/lib/store/refusal.js";
import { ReviewOwnerSelectionError } from "../../../src/lib/store/kinds/review/errors.js";
import { reviewFailureRequestRemedy } from "../../../src/scripts/review-gate/runtime/project-identity-remedy.js";

const lockHeld = (argv?: string[]): StoreRefusal => ({ code: "lock-held", class: "recoverable", lock: "review",
  condition: "The review lock is held.", remedy: { text: "Wait for the holder to finish, then retry.", ...(argv === undefined ? {} : { argv }) } });

it("reports a native refusal whole, keeping its own command as the remedy", () => {
  const refusal = lockHeld(["arc", "store", "pull"]), error = new StoreRefusalError(refusal, true);
  expect(reviewCommandError("review-respond", error, "execution", ReviewCommandErrorEnvelopeSchema)).toEqual({
    schemaVersion: 1, mode: "review-respond", diagnostics: [], error: { code: "store-refused", message: error.message }, refusal,
    remedy: spineRemedy(refusal.condition, refusal.remedy.text, ["arc", "store", "pull"]) });
});

it("retries the command with its submitted request when the refusal names no command", () => {
  const refusal = lockHeld(), submitted = { schemaVersion: 1 };
  const retry = spineRemedy("Retry.", "Retry the response", ["arc", "review", "respond", "-"], submitted);
  expect(reviewCommandError("review-respond", new StoreRefusalError(refusal, true), "execution",
    ReviewCommandErrorEnvelopeSchema, () => retry)).toMatchObject({ error: { code: "store-refused" }, refusal,
    remedy: spineRemedy(refusal.condition, refusal.remedy.text, ["arc", "review", "respond", "-"], submitted) });
  expect(reviewCommandError("review-reduce", new StoreRefusalError(refusal, true), "execution", ReviewCommandErrorEnvelopeSchema))
    .toMatchObject({ remedy: { argv: ["arc", "review", "reduce", "-"] } });
});

it("retries pre-publication on its work unit", () => {
  const refusal = lockHeld();
  expect(reviewCommandError("review-pre-publication", new StoreRefusalError(refusal, true), "execution",
    ReviewCommandErrorEnvelopeSchema, code => prePublicationRemedy(code, "example")))
    .toMatchObject({ error: { code: "store-refused" }, refusal, remedy: { argv: ["arc", "review", "pre-publication", "example"] } });
});

it("keeps an in-repo refusal's code and message as before", () => {
  const error = new StoreRefusalError(lockHeld(["arc", "store", "pull"]), false);
  expect(reviewCommandError("review-respond", error, "execution", ReviewCommandErrorEnvelopeSchema)).toEqual({
    schemaVersion: 1, mode: "review-respond", diagnostics: [], error: { code: "unexpected-failure", message: error.message } });
});

it.each(ReviewCommandModeSchema.options)("requires the refusal and a remedy for %s store refusals", mode => {
  const refusal = lockHeld(), envelope = { schemaVersion: 1, mode, diagnostics: [],
    error: { code: "store-refused", message: "The review lock is held." } };
  const remedy = spineRemedy(refusal.condition, refusal.remedy.text, ["arc", "review", "resolve", "-"], {});
  expect.soft(ReviewCommandErrorEnvelopeSchema.safeParse({ ...envelope, remedy }).success).toBe(false);
  expect.soft(ReviewCommandErrorEnvelopeSchema.safeParse({ ...envelope, refusal }).success).toBe(false);
  expect.soft(ReviewCommandErrorEnvelopeSchema.safeParse({ ...envelope, refusal, remedy }).success).toBe(true);
});

it("reports a work-item selection refusal under its own code, keeping its own command as the remedy", () => {
  const remedy = { text: "Repair the work unit's branch links, then retry.", argv: ["arc", "status", "example"] };
  const error = new ReviewOwnerSelectionError("corrupt-state", "The selected work unit has no branch link.", remedy);
  expect(reviewCommandError("review-local-cancel", error, "execution", ReviewCommandErrorEnvelopeSchema)).toEqual({
    schemaVersion: 1, mode: "review-local-cancel", diagnostics: [], error: { code: "corrupt-state", message: error.message },
    remedy: spineRemedy(error.condition, remedy.text, remedy.argv) });
});

it("retries a review command with its submitted request when a selection refusal names no command", () => {
  const error = new ReviewOwnerSelectionError("invalid-input", "Review records need the invocation's exact work item.",
    { text: "Run the command from the work unit's checkout." }), submitted = { schemaVersion: 1 };
  const retry = reviewFailureRequestRemedy("review-reduce", error, submitted);
  expect(retry).toEqual(spineRemedy(error.condition, error.remedy.text, ["arc", "review", "reduce", "-"], submitted));
  expect(reviewCommandError("review-reduce", error, "execution", ReviewCommandErrorEnvelopeSchema, () => {
    if (retry === undefined) throw new Error("Expected a retry");
    return retry;
  })).toMatchObject({ error: { code: "invalid-input" }, remedy: { argv: ["arc", "review", "reduce", "-"], stdin: submitted } });
  expect(reviewCommandError("review-reduce", error, "execution", ReviewCommandErrorEnvelopeSchema))
    .toMatchObject({ remedy: { argv: ["arc", "review", "reduce", "-"] } });
});

it.each(ReviewCommandModeSchema.options)("accepts a remedy on %s invalid-input and corrupt-state refusals", mode => {
  const remedy = spineRemedy("Refused.", "Retry", ["arc", "review", "resolve", "-"], {});
  for (const code of ["invalid-input", "corrupt-state"] as const) {
    const envelope = { schemaVersion: 1, mode, diagnostics: [], error: { code, message: "Refused." } };
    expect.soft(ReviewCommandErrorEnvelopeSchema.safeParse({ ...envelope, remedy }).success, code).toBe(true);
    if (mode !== "review-pre-publication") {
      expect.soft(ReviewCommandErrorEnvelopeSchema.safeParse(envelope).success, code).toBe(true);
    }
  }
});
