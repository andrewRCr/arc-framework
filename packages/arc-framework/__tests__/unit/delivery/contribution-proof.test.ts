import { describe, expect, it } from "vitest";

import {
  compareDeliveryContribution,
  encodeDeliveryContributionPatch,
  parseDeliveryContributionPatch,
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
      after: { ...input.after, member: { ...input.after.member, tree: input.before.member.tree } },
    })).toEqual({ status: "accepted", proof: "tree-equality" });
  });

  it("accepts only byte-identical canonical aggregate patches", () => {
    const patch = encodeDeliveryContributionPatch("sha1", "diff --git a/a b/a\n-old \n+new \n");
    expect(compareDeliveryContribution({
      ...endpoints(),
      beforePatch: patch,
      afterPatch: patch,
    })).toEqual({ status: "accepted", proof: "aggregate-patch" });

    expect(compareDeliveryContribution({
      ...endpoints(),
      beforePatch: patch,
      afterPatch: encodeDeliveryContributionPatch("sha1", "diff --git a/a b/a\n-old\n+new\n"),
    })).toEqual({ status: "refused", reason: "contribution-mismatch" });
  });

  it("strictly parses SHA-1 and SHA-256 envelopes and refuses truncated or malformed bytes", () => {
    const sha1Patch = encodeDeliveryContributionPatch("sha1", "binary-and-rename-payload\n");
    const sha256Patch = encodeDeliveryContributionPatch("sha256", "mode-change-payload\n");
    expect(parseDeliveryContributionPatch(sha1Patch)).toEqual({
      objectFormat: "sha1",
      payload: "binary-and-rename-payload\n",
    });
    expect(parseDeliveryContributionPatch(sha256Patch)).toEqual({
      objectFormat: "sha256",
      payload: "mode-change-payload\n",
    });
    expect(parseDeliveryContributionPatch(sha1Patch.slice(0, -1))).toBeNull();
    const malformedFormat = new Uint8Array(sha1Patch);
    malformedFormat[35] = "m".charCodeAt(0);
    expect(parseDeliveryContributionPatch(malformedFormat)).toBeNull();
    expect(compareDeliveryContribution({
      ...endpoints(),
      beforePatch: new TextEncoder().encode("malformed"),
      afterPatch: new TextEncoder().encode("malformed"),
    })).toEqual({ status: "refused", reason: "patch-evidence-invalid" });
  });
});
