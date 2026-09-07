import { describe, expect, it } from "vitest";

import {
  compareDeliveryContribution,
  DeliveryContributionProofResultSchema,
} from "../../../src/lib/delivery/contribution-proof.js";

const sha1 = (digit: string): string => digit.repeat(40);

function endpoints() {
  return {
    before: {
      predecessor: { head: sha1("1"), tree: sha1("2") },
      member: { head: sha1("3"), tree: sha1("4") },
    },
    after: {
      predecessor: { head: sha1("5"), tree: sha1("6") },
      member: { head: sha1("7"), tree: sha1("8") },
    },
  };
}

describe("delivery contribution proof", () => {
  it("accepts complete member-tree equality without patch evidence", () => {
    const input = endpoints();
    expect(compareDeliveryContribution({
      ...input,
      after: {
        predecessor: input.before.predecessor,
        member: { ...input.after.member, tree: input.before.member.tree },
      },
    })).toEqual({ status: "accepted", proof: "tree-equality" });
  });

  it("requires a reapply when the predecessor moves despite equal member trees", () => {
    const input = endpoints();
    expect(compareDeliveryContribution({
      ...input,
      after: { ...input.after, member: { ...input.after.member, tree: input.before.member.tree } },
    })).toEqual({ status: "reapply-required" });
  });

  it("rejects a conflicted proof without exact path evidence", () => {
    expect(DeliveryContributionProofResultSchema.safeParse({
      status: "refused",
      reason: "contribution-conflicted",
      paths: [],
    }).success).toBe(false);
  });
});
