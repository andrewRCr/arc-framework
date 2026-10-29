import { describe, expect, it } from "vitest";

import { handleReviewHostedDismiss } from "../../../../../src/handlers/review.js";
import {
  HOSTED_DISMISSAL_MESSAGE,
  HostedDismissResultSchema,
  dismissHostedReview,
  type HostedDismissalReview,
  type HostedReviewDismissalPort,
} from "../../../../../src/scripts/review-gate/hosted/dismiss.js";
import type { HostedGitHubThread } from "../../../../../src/scripts/review-gate/hosted/github.js";
import {
  GhHostedReviewPort,
  HostedProcessError,
  type HostedProcessRunner,
} from "../../../../../src/scripts/review-gate/hosted/gh-process.js";

const HEAD = "a".repeat(40);
const SERVICE = "136622811";
const PERSON = "44483269";
const target = { repository: "owner/repo", pullRequest: 42, headSha: HEAD };
const request = {
  schemaVersion: 1 as const,
  target,
  review: { reviewId: 9001, author: "coderabbitai", commitSha: HEAD, submittedAt: "2026-10-28T12:00:00Z" },
};

function thread(id: string, actorIdentity: string | null, isResolved: boolean): HostedGitHubThread {
  return {
    id,
    isResolved,
    comments: [{
      id: `${id}-comment`, reviewId: "PRR_1", replyToReviewId: null, actorIdentity, body: "finding",
      url: `https://github.com/owner/repo/pull/42#${id}`, path: "src/a.ts", line: 1, headSha: HEAD,
    }],
  };
}

function fakePort(input: {
  head?: string;
  review?: HostedDismissalReview | null;
  threads?: HostedGitHubThread[];
  write?: "dismissed" | "ambiguous" | "refused";
  dismissedAfterWrite?: boolean;
}) {
  const dismissals: Array<{ reviewId: number; message: string }> = [];
  let reads = 0;
  let review = input.review === undefined
    ? { state: "changes-requested", actorIdentity: SERVICE, commitSha: HEAD } as HostedDismissalReview
    : input.review;
  const port: HostedReviewDismissalPort = {
    readHead: async () => input.head ?? HEAD,
    readReview: async () => {
      reads += 1;
      return review;
    },
    readThreads: async () => input.threads ?? [],
    dismissReview: async (_target, reviewId, message) => {
      dismissals.push({ reviewId, message });
      if (input.write === "refused") return { kind: "refused", reason: "HTTP 403: Resource not accessible" };
      if (review !== null && (input.write !== "ambiguous" || input.dismissedAfterWrite === true)) {
        review = { ...review, state: "dismissed" };
      }
      return { kind: input.write ?? "dismissed" };
    },
  };
  return { port, dismissals, reads: () => reads };
}

describe("dismissing a review service's change request", () => {
  it("dismisses it through the public handler, with its own message, once the service's threads are resolved", async () => {
    const { port, dismissals } = fakePort({
      threads: [thread("service-resolved", SERVICE, true), thread("person-open", PERSON, false)],
    });
    const output: string[] = [];
    let exitCode = 0;
    await handleReviewHostedDismiss("-", {
      readText: async () => JSON.stringify(request),
      dismiss: async (parsed) => dismissHostedReview(parsed as typeof request, port, [SERVICE]),
      write: (text) => { output.push(text); },
      setExitCode: (code) => { exitCode = code; },
    });
    expect(exitCode, output.join("")).toBe(0);
    expect(HostedDismissResultSchema.parse(JSON.parse(output[0]!))).toMatchObject({
      mode: "review-hosted-dismiss", state: "dismissed", nextAction: "complete", reviewId: 9001,
    });
    expect(dismissals).toEqual([{ reviewId: 9001, message: HOSTED_DISMISSAL_MESSAGE }]);
  });

  it("refuses, before any mutation, while one of the service's threads is unresolved", async () => {
    const { port, dismissals } = fakePort({
      threads: [thread("service-open", SERVICE, false), thread("service-resolved", SERVICE, true)],
    });
    await expect(dismissHostedReview(request, port, [SERVICE])).resolves.toMatchObject({
      state: "unresolved-threads", nextAction: "stop", threadIds: ["service-open"],
    });
    expect(dismissals).toEqual([]);
  });

  it.each([
    ["a person's review", { review: { state: "changes-requested", actorIdentity: PERSON, commitSha: HEAD } },
      "not-review-service"],
    ["a moved head", { head: "b".repeat(40) }, "stale-target"],
    ["a review the host does not have", { review: null }, "missing-review"],
    ["a review that is not a change request", { review: { state: "commented", actorIdentity: SERVICE, commitSha: HEAD } },
      "not-change-request"],
    ["a review of another commit", { review: { state: "changes-requested", actorIdentity: SERVICE, commitSha: "c".repeat(40) } },
      "review-mismatch"],
  ] as const)("refuses %s without dismissing anything", async (_label, scenario, state) => {
    const { port, dismissals } = fakePort(scenario as Parameters<typeof fakePort>[0]);
    await expect(dismissHostedReview(request, port, [SERVICE])).resolves.toMatchObject({ state, nextAction: "stop" });
    expect(dismissals).toEqual([]);
  });

  it("completes without another write when the host already reports the review dismissed", async () => {
    const { port, dismissals } = fakePort({ review: { state: "dismissed", actorIdentity: SERVICE, commitSha: HEAD } });
    await expect(dismissHostedReview(request, port, [SERVICE])).resolves.toMatchObject({
      state: "already-dismissed", nextAction: "complete",
    });
    expect(dismissals).toEqual([]);
  });

  it("confirms an uncertain write by reading the review back", async () => {
    const confirmed = fakePort({ write: "ambiguous", dismissedAfterWrite: true });
    await expect(dismissHostedReview(request, confirmed.port, [SERVICE])).resolves.toMatchObject({ state: "dismissed" });
    const unconfirmed = fakePort({ write: "ambiguous" });
    await expect(dismissHostedReview(request, unconfirmed.port, [SERVICE])).resolves.toMatchObject({
      state: "ambiguous", nextAction: "stop",
    });
  });

  it("reports the host's refusal as a stop of its own, without reading the review back", async () => {
    const refused = fakePort({ write: "refused" });
    const result = await dismissHostedReview(request, refused.port, [SERVICE]);
    expect(result).toMatchObject({ state: "host-refused", nextAction: "stop" });
    expect(result.state === "host-refused" && result.detail).toContain("HTTP 403: Resource not accessible");
    expect(refused.reads()).toBe(1);
  });
});

describe("GitHub's review dismissal calls", () => {
  function runner(handle: (args: string[]) => string) {
    const calls: string[][] = [];
    const boundary: HostedProcessRunner = {
      run: async (args) => {
        calls.push(args);
        return { stdout: handle(args), stderr: "" };
      },
    };
    return { boundary, calls };
  }

  it("reads one review by its ID, and reports a missing one as null", async () => {
    const found = runner(() => JSON.stringify({ state: "CHANGES_REQUESTED", user: { id: 136622811 }, commit_id: HEAD }));
    await expect(new GhHostedReviewPort(found.boundary).readReview(target, 9001)).resolves.toEqual({
      state: "changes-requested", actorIdentity: SERVICE, commitSha: HEAD,
    });
    expect(found.calls).toEqual([["api", "repos/owner/repo/pulls/42/reviews/9001"]]);
    const missing: HostedProcessRunner = {
      run: async () => { throw new HostedProcessError("gh: Not Found (HTTP 404)", "gh: Not Found (HTTP 404)", 1, 404); },
    };
    await expect(new GhHostedReviewPort(missing).readReview(target, 9001)).resolves.toBeNull();
  });

  it("dismisses with the given message and confirms the host's dismissed state", async () => {
    const dismissed = runner(() => JSON.stringify({ state: "DISMISSED" }));
    await expect(new GhHostedReviewPort(dismissed.boundary).dismissReview(target, 9001, HOSTED_DISMISSAL_MESSAGE))
      .resolves.toEqual({ kind: "dismissed" });
    expect(dismissed.calls).toEqual([[
      "api", "repos/owner/repo/pulls/42/reviews/9001/dismissals", "--method", "PUT",
      "--raw-field", `message=${HOSTED_DISMISSAL_MESSAGE}`, "--raw-field", "event=DISMISS",
    ]]);
    const other = runner(() => JSON.stringify({ state: "CHANGES_REQUESTED" }));
    await expect(new GhHostedReviewPort(other.boundary).dismissReview(target, 9001, HOSTED_DISMISSAL_MESSAGE))
      .resolves.toEqual({ kind: "ambiguous" });
  });

  it.each([
    [403, { kind: "refused", reason: "gh: Resource not accessible (HTTP 403)" }],
    [429, { kind: "ambiguous" }],
    [null, { kind: "ambiguous" }],
  ] as const)("classifies a failed dismissal with HTTP status %s", async (status, expected) => {
    const failing: HostedProcessRunner = {
      run: async () => {
        throw new HostedProcessError("gh: Resource not accessible (HTTP 403)", "", 1, status);
      },
    };
    await expect(new GhHostedReviewPort(failing).dismissReview(target, 9001, HOSTED_DISMISSAL_MESSAGE))
      .resolves.toEqual(expected);
  });
});
