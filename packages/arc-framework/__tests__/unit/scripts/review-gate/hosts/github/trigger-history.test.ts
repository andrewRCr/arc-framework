import { describe, expect, it, vi } from "vitest";

import {
  GitHubTriggerHistoryReader,
  type GitHubTriggerHistoryApi,
} from "../../../../../../src/scripts/review-gate/hosts/github/trigger-history.js";

const HEAD = "a".repeat(40);

describe("GitHub PR-wide trigger history", () => {
  it("normalizes complete comments and immutable label timeline events", async () => {
    const api: GitHubTriggerHistoryApi = {
      listIssueComments: vi.fn().mockResolvedValue([
        {
          id: 10, nodeId: "IC_10", actorIdentity: "101", body: "@provider review",
          createdAt: "2026-07-12T20:00:00.000Z", updatedAt: "2026-07-12T20:00:00.000Z",
        },
        {
          id: 11, nodeId: "IC_11", actorIdentity: "102", body: "changed command",
          createdAt: "2026-07-12T20:01:00.000Z", updatedAt: "2026-07-12T20:02:00.000Z",
        },
      ]),
      listLabelEvents: vi.fn().mockResolvedValue([
        {
          nodeId: "LE_20", actorIdentity: "103", label: "arc-review-gate",
          occurredAt: "2026-07-12T20:03:00.000Z", mutation: "applied",
        },
        {
          nodeId: "LE_21", actorIdentity: "103", label: "arc-review-gate",
          occurredAt: "2026-07-12T20:04:00.000Z", mutation: "removed",
        },
      ]),
    };
    const events = await new GitHubTriggerHistoryReader(api).read(HEAD);

    expect(events).toEqual([
      expect.objectContaining({
        eventId: "IC_10", actorIdentity: "101", eventKind: "comment", mutation: "created",
        observedHeadSha: HEAD, authenticatedEventRef: "github:issue-comment:10",
      }),
      expect.objectContaining({ eventId: "IC_11", mutation: "edited" }),
      expect.objectContaining({
        eventId: "LE_20", actorIdentity: "103", eventKind: "label", mutation: "applied",
        authenticatedEventRef: "github:timeline:LE_20",
      }),
      expect.objectContaining({ eventId: "LE_21", mutation: "removed" }),
    ]);
    expect(events.every((event) => /^[a-f0-9]{64}$/u.test(event.contentDigest))).toBe(true);
  });

  it("fails closed instead of returning partial history", async () => {
    const api: GitHubTriggerHistoryApi = {
      listIssueComments: () => Promise.reject(new Error("pagination incomplete")),
      listLabelEvents: () => Promise.resolve([]),
    };
    await expect(new GitHubTriggerHistoryReader(api).read(HEAD)).rejects.toThrow(/pagination incomplete/u);
  });
});
