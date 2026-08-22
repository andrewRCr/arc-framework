import { describe, expect, it } from "vitest";

import type {
  DeliveryMemberLookupResult,
} from "../../../../../src/scripts/review-gate/core/delivery-member-lookup.js";
import {
  resolveAcceptableDeliveryBaseRefs,
} from "../../../../../src/scripts/review-gate/core/delivery-member-lookup.js";
import {
  resolveReviewSubject,
} from "../../../../../src/scripts/review-gate/core/review-subject.js";

const HEAD = "a".repeat(40);
const member = {
  planId: "plan-1",
  deliverableId: "member-1",
  workUnitId: "example",
  base: "b".repeat(40),
  baseRef: "main",
  head: HEAD,
  isFinalMember: false,
};

function lookup(result: DeliveryMemberLookupResult) {
  return { resolveMemberByHead: async () => result };
}

describe("review subject resolution", () => {
  it("derives the exact base branch from a bound delivery head", async () => {
    await expect(resolveAcceptableDeliveryBaseRefs(
      lookup({ status: "resolved", member }),
      HEAD,
    )).resolves.toEqual(["main"]);
  });

  it("resolves a bound delivery head to its owning work unit", async () => {
    await expect(resolveReviewSubject({
      headRef: "delivery/plan-1/member-1",
      headSha: HEAD,
      memberLookup: lookup({ status: "resolved", member }),
    })).resolves.toEqual({ status: "resolved", workUnitId: "example", member });
  });

  it("keeps an authoritatively unbound head distinct", async () => {
    await expect(resolveReviewSubject({
      headRef: "delivery/plan-1/member-1",
      headSha: HEAD,
      memberLookup: lookup({ status: "unbound" }),
    })).resolves.toEqual({ status: "unbound" });
  });

  it("keeps an unavailable delivery read distinct", async () => {
    await expect(resolveReviewSubject({
      headRef: "delivery/plan-1/member-1",
      headSha: HEAD,
      memberLookup: lookup({ status: "unavailable" }),
    })).resolves.toEqual({ status: "unavailable" });
  });

  it("preserves ordinary work-unit branch resolution", async () => {
    await expect(resolveReviewSubject({
      headRef: "feat/example",
      headSha: HEAD,
      memberLookup: lookup({ status: "unavailable" }),
    })).resolves.toEqual({ status: "resolved", workUnitId: "example", member: null });
  });
});
