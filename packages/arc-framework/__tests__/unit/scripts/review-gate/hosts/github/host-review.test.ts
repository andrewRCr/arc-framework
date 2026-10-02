import { describe, expect, it, vi } from "vitest";

import type { HostedProcessRunner } from "../../../../../../src/scripts/review-gate/hosted/gh-process.js";
import { readHostReview } from "../../../../../../src/scripts/review-gate/host-review.js";
import { createGhHostReviewPort } from "../../../../../../src/scripts/review-gate/hosts/github/host-review.js";

const oid = (character: string): string => character.repeat(40);
const signal = new AbortController().signal;
const submittedAt = "2026-10-02T18:43:15Z";

function review(databaseId: number, state: string, login: string | null, commit: string | null) {
  return {
    databaseId,
    state,
    submittedAt,
    author: login === null ? null : { login },
    commit: commit === null ? null : { oid: commit },
  };
}

function response(reviewDecision: string | null, nodes: unknown[] = []) {
  return {
    stdout: JSON.stringify({
      data: { repository: { pullRequest: { reviewDecision, latestOpinionatedReviews: { nodes } } } },
    }),
    stderr: "",
  };
}

describe("GitHub host review port", () => {
  it("lists the latest reviews from writers that still request changes", async () => {
    const run = vi.fn<HostedProcessRunner["run"]>(async () => response("CHANGES_REQUESTED", [
      review(11, "CHANGES_REQUESTED", "coderabbitai", oid("a")),
      review(12, "APPROVED", "maintainer", oid("b")),
    ]));
    const port = createGhHostReviewPort({ run } satisfies HostedProcessRunner);

    await expect(port.read("owner/repo", 42, signal)).resolves.toEqual({
      state: "changes-requested",
      blockingReviews: [{ reviewId: 11, author: "coderabbitai", commitSha: oid("a"), submittedAt }],
    });
    const args = run.mock.calls[0]?.[0] ?? [];
    expect(args.slice(0, 2)).toEqual(["api", "graphql"]);
    expect(args.find((arg) => arg.startsWith("query="))).toContain(
      "latestOpinionatedReviews(first:100,writersOnly:true)",
    );
    expect(args).toEqual(expect.arrayContaining(["owner=owner", "name=repo", "number=42"]));
  });

  it("names a deleted reviewer and keeps a review without a commit", async () => {
    const port = createGhHostReviewPort({
      run: async () => response("CHANGES_REQUESTED", [review(13, "CHANGES_REQUESTED", null, null)]),
    });

    await expect(port.read("owner/repo", 42, signal)).resolves.toEqual({
      state: "changes-requested",
      blockingReviews: [{ reviewId: 13, author: "ghost", commitSha: null, submittedAt }],
    });
  });

  it.each([
    ["REVIEW_REQUIRED", { state: "approval-required" }],
    ["APPROVED", { state: "clear" }],
    [null, { state: "clear" }],
  ] as const)("reads a %s decision as %o", async (decision, expected) => {
    const port = createGhHostReviewPort({ run: async () => response(decision) });

    await expect(port.read("owner/repo", 42, signal)).resolves.toEqual(expected);
  });

  it("refuses a response that does not carry the review decision", async () => {
    const port = createGhHostReviewPort({
      run: async () => ({ stdout: JSON.stringify({ data: { repository: null } }), stderr: "" }),
    });

    await expect(port.read("owner/repo", 42, signal)).rejects.toThrow();
  });

  it("reports an unreadable host as unavailable with the failure", async () => {
    await expect(readHostReview({
      read: async () => {
        throw new Error("gh: HTTP 502");
      },
    }, "owner/repo", 42, signal)).resolves.toEqual({ state: "unavailable", detail: "gh: HTTP 502" });
  });
});
