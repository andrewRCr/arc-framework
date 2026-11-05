/** Each native typed refusal reports its code, message, condition, and remedy through one projection. */
import { expect, it } from "vitest";
import { nativeRefusalReport, nativeRefusalText } from "../../../../src/lib/store/native-refusal.js";
import { ProjectIdentityError } from "../../../../src/lib/store/project-identity.js";
import { StoreRefusalError } from "../../../../src/lib/store/refusal-error.js";
import { ReviewOwnerSelectionError, ReviewVehicleUnresolvedError } from "../../../../src/lib/store/kinds/review/errors.js";
import type { StoreRefusal } from "../../../../src/lib/store/refusal.js";

const refusal: StoreRefusal = { code: "lock-held", class: "recoverable", lock: "review",
  condition: "The review lock is held.", remedy: { text: "Wait for the holder to finish, then retry.", argv: ["arc", "store", "pull"] } };

it("reports each native typed refusal under the code a command reports it with", () => {
  const identity = new ProjectIdentityError({ status: "unavailable", reason: "Project identity is unavailable.",
    remedy: { text: "Seed the project record, then retry." } });
  expect(nativeRefusalReport(identity)).toEqual({ code: "project-identity-unavailable", message: identity.message,
    condition: "Project identity is unavailable.", remedy: identity.failure.remedy });
  const selection = new ReviewOwnerSelectionError("corrupt-state", "The linked work-unit metadata is missing.",
    { text: "Restore the work unit's metadata, then retry." });
  expect(nativeRefusalReport(selection)).toEqual({ code: "corrupt-state", message: selection.message,
    condition: selection.condition, remedy: selection.remedy });
  const store = new StoreRefusalError(refusal, true);
  expect(nativeRefusalReport(store)).toEqual({ code: "store-refused", message: store.message,
    condition: refusal.condition, remedy: refusal.remedy, refusal });
});

it("reports a missing review vehicle as a work-item selection refusal naming the ways to get one", () => {
  const error = new ReviewVehicleUnresolvedError("Frontline review needs one work unit or Errand active at this checkout.");
  expect(error).toBeInstanceOf(ReviewOwnerSelectionError);
  expect(error.reason).toBe("vehicle-unresolved");
  expect(nativeRefusalReport(error)).toMatchObject({ code: "invalid-input", condition: error.condition,
    remedy: { text: expect.stringMatching(/checkout.*arc errand open.*delivery member/u) } });
});

it("reports nothing for an in-repo store refusal or any other failure", () => {
  expect(nativeRefusalReport(new StoreRefusalError(refusal, false))).toBeNull();
  expect(nativeRefusalReport(new Error("unrelated"))).toBeNull();
  expect(nativeRefusalText(new Error("unrelated"))).toBeNull();
  expect(nativeRefusalText(new StoreRefusalError(refusal, true))).toBe(
    "The review lock is held. Wait for the holder to finish, then retry. `arc store pull`");
});
