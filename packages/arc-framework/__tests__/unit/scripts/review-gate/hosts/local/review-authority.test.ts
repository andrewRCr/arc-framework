import { describe, expect, it, vi } from "vitest";

import type {
  DeliveryMemberBinding,
  DeliveryMemberLookup,
  DeliveryMemberLookupResult,
} from "../../../../../../src/scripts/review-gate/core/delivery-member-lookup.js";
import {
  resolveLocalReviewAuthority,
} from "../../../../../../src/scripts/review-gate/hosts/local/review-authority.js";

const MEMBER_HEAD = "c".repeat(40);
const DELIVERABLE_ID = `sha256:${"a".repeat(64)}`;
const ERRAND_CLAIM_ID = "claim-1";

const binding = (overrides: Partial<DeliveryMemberBinding> = {}): DeliveryMemberBinding => ({
  planId: "stack-1",
  deliverableId: DELIVERABLE_ID,
  workUnitId: "review-surface-binding",
  base: "b".repeat(40),
  baseRef: "main",
  head: MEMBER_HEAD,
  candidateHead: MEMBER_HEAD,
  isFinalMember: false,
  ...overrides,
  headRef: overrides.headRef === undefined ? "delivery/stack-1/member-1" : overrides.headRef,
});

const lookupOf = (result: DeliveryMemberLookupResult): DeliveryMemberLookup => ({
  resolveMemberByHead: vi.fn(async () => result),
});

const workUnitContext = () => ({
  activeIdentity: "andrew",
  workUnit: { identity: "review-surface-binding", owner: "andrew" },
  errand: null,
});

const runtimeBinding = async () => ({ kind: "arc-cli", identity: "arc-cli/0.1.0" });

describe("local review actor authority", () => {
  it("uses the canonical work-unit owner and requires the active identity to match", async () => {
    const readLiveContext = vi.fn(async () => workUnitContext());
    const resolveRuntimeBinding = vi.fn(runtimeBinding);

    await expect(resolveLocalReviewAuthority(
      { evaluatorIdentity: "fresh-reviewer" },
      { readLiveContext, resolveRuntimeBinding },
    )).resolves.toEqual({
      authority: {
        vehicle: { kind: "work-unit", identity: "review-surface-binding" },
        authorIdentity: "andrew",
        evaluatorIdentity: "fresh-reviewer",
        attestationRuntimeKind: "arc-cli",
        runtimeIdentity: "arc-cli/0.1.0",
        attestationMechanism: "local-attestation",
      },
      member: null,
    });
    expect(readLiveContext).toHaveBeenCalledOnce();
    expect(resolveRuntimeBinding).toHaveBeenCalledOnce();

    readLiveContext.mockResolvedValueOnce({
      activeIdentity: "different-owner",
      workUnit: { identity: "review-surface-binding", owner: "andrew" },
      errand: null,
    });
    await expect(resolveLocalReviewAuthority(
      { evaluatorIdentity: "fresh-reviewer" },
      { readLiveContext, resolveRuntimeBinding },
    )).rejects.toThrow(/active-identity-owner-mismatch/u);
  });

  it("uses the active ARC identity as an Errand author", async () => {
    await expect(resolveLocalReviewAuthority(
      { evaluatorIdentity: "fresh-reviewer" },
      {
        readLiveContext: async () => ({
          activeIdentity: "andrew",
          workUnit: null,
          errand: { identity: "repair-review-state", claimId: ERRAND_CLAIM_ID },
        }),
        resolveRuntimeBinding: runtimeBinding,
      },
    )).resolves.toMatchObject({
      authority: {
        vehicle: { kind: "errand", identity: "repair-review-state", claimId: ERRAND_CLAIM_ID },
        authorIdentity: "andrew",
      },
      member: null,
    });
  });

  it("rejects self-review and derives runtime identity only from the installed binding", async () => {
    const resolveRuntimeBinding = vi.fn(runtimeBinding);
    const dependencies = {
      readLiveContext: async () => workUnitContext(),
      resolveRuntimeBinding,
    };

    await expect(resolveLocalReviewAuthority(
      { evaluatorIdentity: "andrew" },
      dependencies,
    )).rejects.toThrow(/author-evaluator-must-differ/u);
    expect(resolveRuntimeBinding).not.toHaveBeenCalled();
  });

  it("keeps the unresolved-vehicle refusal on the no-selector path", async () => {
    for (const context of [
      { activeIdentity: "andrew", workUnit: null, errand: null },
      {
        activeIdentity: "andrew",
        workUnit: { identity: "review-surface-binding", owner: "andrew" },
        errand: { identity: "repair-review-state", claimId: ERRAND_CLAIM_ID },
      },
    ]) {
      await expect(resolveLocalReviewAuthority(
        { evaluatorIdentity: "fresh-reviewer" },
        { readLiveContext: async () => context, resolveRuntimeBinding: runtimeBinding },
      )).rejects.toThrow(/vehicle-unresolved/u);
    }
  });

  it("refuses a selector when no lookup port is bound", async () => {
    await expect(resolveLocalReviewAuthority(
      { evaluatorIdentity: "fresh-reviewer", memberHeadObjectId: MEMBER_HEAD },
      { readLiveContext: async () => workUnitContext(), resolveRuntimeBinding: runtimeBinding },
    )).rejects.toThrow(/delivery-state-unavailable/u);
  });

  it("yields a member vehicle when the named head belongs to the originating locus's work unit", async () => {
    const memberLookup = lookupOf({ status: "resolved", member: binding() });

    await expect(resolveLocalReviewAuthority(
      { evaluatorIdentity: "fresh-reviewer", memberHeadObjectId: MEMBER_HEAD },
      {
        readLiveContext: async () => workUnitContext(),
        resolveRuntimeBinding: runtimeBinding,
        memberLookup,
      },
    )).resolves.toEqual({
      authority: {
        vehicle: { kind: "delivery-member", identity: DELIVERABLE_ID },
        authorIdentity: "andrew",
        evaluatorIdentity: "fresh-reviewer",
        attestationRuntimeKind: "arc-cli",
        runtimeIdentity: "arc-cli/0.1.0",
        attestationMechanism: "local-attestation",
      },
      member: { base: "b".repeat(40), head: MEMBER_HEAD },
    });
    expect(memberLookup.resolveMemberByHead).toHaveBeenCalledWith(MEMBER_HEAD);
  });

  it("refuses a member belonging to another work unit's plan", async () => {
    await expect(resolveLocalReviewAuthority(
      { evaluatorIdentity: "fresh-reviewer", memberHeadObjectId: MEMBER_HEAD },
      {
        readLiveContext: async () => workUnitContext(),
        resolveRuntimeBinding: runtimeBinding,
        memberLookup: lookupOf({
          status: "resolved",
          member: binding({ workUnitId: "some-other-work-unit" }),
        }),
      },
    )).rejects.toThrow(/delivery-member-work-unit-mismatch/u);
  });

  it("refuses an unavailable or unbound lookup", async () => {
    for (const [result, reason] of [
      [{ status: "unavailable" } as const, /delivery-state-unavailable/u],
      [{ status: "unbound" } as const, /delivery-member-unbound/u],
    ] as const) {
      await expect(resolveLocalReviewAuthority(
        { evaluatorIdentity: "fresh-reviewer", memberHeadObjectId: MEMBER_HEAD },
        {
          readLiveContext: async () => workUnitContext(),
          resolveRuntimeBinding: runtimeBinding,
          memberLookup: lookupOf(result),
        },
      )).rejects.toThrow(reason);
    }
  });

  it("refuses a selector supplied in an Errand context, distinctly from an unresolved vehicle", async () => {
    const attempt = resolveLocalReviewAuthority(
      { evaluatorIdentity: "fresh-reviewer", memberHeadObjectId: MEMBER_HEAD },
      {
        readLiveContext: async () => ({
          activeIdentity: "andrew",
          workUnit: null,
          errand: { identity: "repair-review-state", claimId: ERRAND_CLAIM_ID },
        }),
        resolveRuntimeBinding: runtimeBinding,
        memberLookup: lookupOf({ status: "resolved", member: binding() }),
      },
    );
    await expect(attempt).rejects.toThrow(/delivery-member-requires-work-unit/u);
    await expect(attempt).rejects.not.toThrow(/vehicle-unresolved/u);
  });

  it("refuses the plan's final member", async () => {
    await expect(resolveLocalReviewAuthority(
      { evaluatorIdentity: "fresh-reviewer", memberHeadObjectId: MEMBER_HEAD },
      {
        readLiveContext: async () => workUnitContext(),
        resolveRuntimeBinding: runtimeBinding,
        memberLookup: lookupOf({ status: "resolved", member: binding({ isFinalMember: true }) }),
      },
    )).rejects.toThrow(/delivery-member-terminal/u);
  });

  it("keeps actor separation unchanged for a member", async () => {
    const memberDependencies = (evaluatorIdentity: string, runtimeIdentity: string) => ({
      input: { evaluatorIdentity, memberHeadObjectId: MEMBER_HEAD },
      dependencies: {
        readLiveContext: async () => workUnitContext(),
        resolveRuntimeBinding: async () => ({ kind: "arc-cli", identity: runtimeIdentity }),
        memberLookup: lookupOf({ status: "resolved", member: binding() }),
      },
    });

    const selfReview = memberDependencies("andrew", "arc-cli/0.1.0");
    await expect(resolveLocalReviewAuthority(selfReview.input, selfReview.dependencies))
      .rejects.toThrow(/author-evaluator-must-differ/u);

    const runtimeIsAuthor = memberDependencies("fresh-reviewer", "andrew");
    await expect(resolveLocalReviewAuthority(runtimeIsAuthor.input, runtimeIsAuthor.dependencies))
      .rejects.toThrow(/runtime-actor-must-differ/u);

    const runtimeIsEvaluator = memberDependencies("fresh-reviewer", "fresh-reviewer");
    await expect(resolveLocalReviewAuthority(runtimeIsEvaluator.input, runtimeIsEvaluator.dependencies))
      .rejects.toThrow(/runtime-actor-must-differ/u);

    await expect(resolveLocalReviewAuthority(
      { evaluatorIdentity: "fresh-reviewer", memberHeadObjectId: MEMBER_HEAD },
      {
        readLiveContext: async () => ({
          activeIdentity: "different-owner",
          workUnit: { identity: "review-surface-binding", owner: "andrew" },
          errand: null,
        }),
        resolveRuntimeBinding: runtimeBinding,
        memberLookup: lookupOf({ status: "resolved", member: binding() }),
      },
    )).rejects.toThrow(/active-identity-owner-mismatch/u);
  });
});
