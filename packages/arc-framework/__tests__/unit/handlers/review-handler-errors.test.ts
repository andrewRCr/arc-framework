/** Review commands report a native store refusal with its code and remedy, and an in-repo one as before. */
import { expect, it } from "vitest";
import { reviewCommandError } from "../../../src/handlers/review-handler-errors.js";
import { StoreRefusalError } from "../../../src/lib/store/refusal-error.js";
import { spineRemedy } from "../../../src/scripts/integration/spine-refusal.js";
import { prePublicationRemedy, ReviewCommandErrorEnvelopeSchema, ReviewCommandModeSchema }
  from "../../../src/scripts/review-gate/core/review-command-envelope.js";
import type { StoreRefusal } from "../../../src/lib/store/refusal.js";

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
