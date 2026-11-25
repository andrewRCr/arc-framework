/** Native work-unit resolution refusals survive delivery phase boundaries and retry the same request. */
import { expect, it } from "vitest";
import { createNativePublishedDeliveryFixture, invokeNativeDelivery, createNativePendingResponseFixture, createNativeCorrectedAuthoringFixture, prepareNativeDeliveryGates } from "../helpers/store/native-delivery-refusal.js";
import { refuseNativeListing } from "../helpers/store/native-record-fault.js";

it.each(["authoring rematerialize", "authoring rebind", "review-fix publish", "originating top", "rematerialize lifecycle", "eligibility lifecycle"] as const)("preserves %s active-owner refusal and resumes after repair", async phase => {
  const corrected = phase === "authoring rebind" || phase === "review-fix publish" ? await createNativeCorrectedAuthoringFixture() : null;
  const h = corrected ?? (phase === "authoring rematerialize" ? await createNativePendingResponseFixture()
    : await createNativePublishedDeliveryFixture());
  const locators = phase === "rematerialize lifecycle" || phase === "originating top" || phase === "eligibility lifecycle"
    ? await prepareNativeDeliveryGates(h) : [];
  if (phase === "review-fix publish" && corrected !== null) {
    const { rebindDeliveryCandidateRef } = await import("../../src/lib/delivery/git-materialization.js");
    const head = (await h.realExec("git", ["rev-parse", "HEAD"], { cwd: corrected.authoring.checkoutPath })).stdout.trim();
    const before = await h.git("rev-parse", corrected.authoring.ref);
    expect(await rebindDeliveryCandidateRef({ exec: h.realExec, ref: corrected.authoring.ref, beforeHead: before, requestedHead: head })).toMatchObject({ status: "rewritten" });
  }
  const command = phase === "review-fix publish" ? "review-fix-publish" : (phase === "rematerialize lifecycle" || phase === "originating top") ? "rematerialize" : phase === "eligibility lifecycle" ? "eligibility-prepare" : "review-fix-continue";
  const request = command === "rematerialize" ? { planId: h.plan.planId, protectedBaseRef: "refs/heads/main",
    topRef: `refs/heads/${h.branches[1]}`, selectedDeliverableIds: [h.plan.members[0]!.deliverableId], repository: "owner/repo", remote: "origin" }
    : command === "eligibility-prepare" ? { plan: h.plan, protectedBaseRef: "refs/heads/main", topRef: `refs/heads/${h.branches[1]}`,
      candidates: locators.map(locator => ({ deliverableId: locator.deliverableId, ref: locator.candidateRef })), lifecyclePaths: [] }
    : command === "review-fix-publish" ? { planId: h.plan.planId, selectedDeliverableId: h.plan.members[0]!.deliverableId,
      repository: "owner/repo", remote: "origin" } : { repository: "owner/repo", remote: "origin" };
  const fault = await refuseNativeListing(h.reference.store, { family: "work-item", kind: "work-item/meta" },
    phase === "review-fix publish" || phase === "originating top" || phase === "eligibility lifecycle" ? 1 : 2);
  const run = () => invokeNativeDelivery(h, command, request, fault.store);
  const refused = await run();
  if (command === "rematerialize" || command === "eligibility-prepare") {
    expect(refused.result, refused.output).toMatchObject({ status: "refused", detail: expect.stringContaining(fault.refusal.condition) });
    expect(refused.result).toHaveProperty("detail", expect.stringContaining(fault.refusal.remedy.text));
  } else if (command === "review-fix-publish") {
    expect(refused.result, refused.output).toMatchObject({ status: "refused", reason: "execution-unavailable",
      recommendedActionText: expect.stringContaining(fault.refusal.condition) });
    expect(refused.result).toHaveProperty("recommendedActionText", expect.stringContaining(fault.refusal.remedy.text));
  } else expect(refused.result, refused.output).toMatchObject({ status: "rejected", refusal: fault.refusal });
  expect(fault.injected()).toBe(1);
  fault.repair();
  const repaired = await run();
  expect(repaired.exits, repaired.output).toEqual([]);
  const expectedStatus = phase === "authoring rematerialize" ? "authoring-required"
    : phase === "authoring rebind" ? "verification-required" : phase === "review-fix publish" ? "published"
      : phase === "eligibility lifecycle" ? "prepared" : "rematerialized";
  expect(repaired.result, repaired.output).toMatchObject({ status: expectedStatus });
}, 60_000);
