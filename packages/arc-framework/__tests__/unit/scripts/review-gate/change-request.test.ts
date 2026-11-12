/** Exact-head change-request resolution behavior. */

import { describe, expect, it } from "vitest";

import {
  resolveChangeRequest,
  type ChangeRequestResolutionPort,
} from "../../../../src/scripts/review-gate/change-request.js";

const headRef = "feat/exact-head";
const headSha = "a".repeat(40);
const request = { headRef, headSha, baseRef: "main" } as const;

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    number: 42,
    url: "https://github.com/owner/repo/pull/42",
    state: "OPEN" as const,
    baseRefName: "main",
    headRefName: headRef,
    headRefOid: headSha,
    ...overrides,
  };
}

function port(overrides: Partial<ChangeRequestResolutionPort> = {}): ChangeRequestResolutionPort {
  return {
    resolveRepository: async () => "owner/repo",
    readHeadRef: async () => ({ local: headSha, remote: headSha }),
    listByHead: async () => [],
    searchByHeadSha: async () => [],
    ...overrides,
  };
}

describe("exact-head change-request resolution", () => {
  it("permits creation when the host has no candidate", async () => {
    await expect(resolveChangeRequest(request, port())).resolves.toEqual({
      schemaVersion: 1,
      mode: "review-change-request-resolve",
      targetRef: { repository: "owner/repo", headRef, headSha },
      state: "none",
      nextAction: "create-change-request",
    });
  });

  it("reuses one open change request at the exact head", async () => {
    await expect(resolveChangeRequest(request, port({
      listByHead: async () => [candidate()],
    }))).resolves.toMatchObject({
      state: "open",
      nextAction: "reuse-change-request",
      candidate: { number: 42, headRefOid: headSha },
    });
  });

  it("completes when one merged change request matches the exact head", async () => {
    await expect(resolveChangeRequest(request, port({
      listByHead: async () => [candidate({ state: "MERGED" })],
    }))).resolves.toMatchObject({
      state: "merged-at-head",
      nextAction: "complete",
      candidate: { number: 42 },
    });
  });

  it("reconciles when the branch merged at a different head", async () => {
    await expect(resolveChangeRequest(request, port({
      listByHead: async () => [candidate({ state: "MERGED", headRefOid: "b".repeat(40) })],
    }))).resolves.toMatchObject({
      state: "merged-stale-head",
      nextAction: "reconcile-head",
      candidate: { headRefOid: "b".repeat(40) },
    });
  });

  it("offers reopening for one exact closed-unmerged change request", async () => {
    await expect(resolveChangeRequest(request, port({
      listByHead: async () => [candidate({ state: "CLOSED" })],
    }))).resolves.toMatchObject({
      state: "closed-unmerged",
      nextAction: "reopen-change-request",
      candidate: { number: 42 },
    });
  });

  it("offers reopening when the sole closed request remains at the prior head", async () => {
    const movedHead = "b".repeat(40);
    await expect(resolveChangeRequest({ ...request, headSha: movedHead }, port({
      readHeadRef: async () => ({ local: movedHead, remote: movedHead }),
      listByHead: async () => [candidate({ state: "CLOSED", headRefOid: headSha })],
    }))).resolves.toMatchObject({
      state: "closed-unmerged",
      nextAction: "reopen-change-request",
      candidate: { number: 42, headRefOid: headSha },
    });
  });

  it("stops with every candidate when host state is ambiguous", async () => {
    const candidates = [candidate(), candidate({ number: 43, url: "https://github.com/owner/repo/pull/43" })];
    const result = await resolveChangeRequest(request, port({
      listByHead: async () => candidates,
    }));
    expect(result).toMatchObject({
      state: "ambiguous",
      nextAction: "stop",
      candidates,
    });
    expect(result).not.toHaveProperty("remedy");
  });

  it("precomposes push and re-resolution for one open request at the prior head", async () => {
    const movedHead = "b".repeat(40);
    await expect(resolveChangeRequest({ ...request, headSha: movedHead }, port({
      readHeadRef: async () => ({ local: movedHead, remote: headSha }),
      listByHead: async () => [candidate()],
    }))).resolves.toMatchObject({
      state: "ambiguous",
      nextAction: "stop",
      candidates: [{ number: 42, headRefOid: headSha }],
      remedy: {
        invariant: "An open change request exists at a different head.",
        argv: [
          "arc",
          "review",
          "change-request",
          "resolve",
          "--head-ref",
          headRef,
          "--head-sha",
          movedHead,
        ],
      },
    });
  });

  it("shell-quotes an unusual valid branch name without changing the structured remedy", async () => {
    const unusualHeadRef = "feat/operator's-review";
    const movedHead = "b".repeat(40);
    const result = await resolveChangeRequest({ ...request, headRef: unusualHeadRef, headSha: movedHead }, port({
      readHeadRef: async () => ({ local: movedHead, remote: headSha }),
      listByHead: async () => [candidate()],
    }));

    expect(result).toMatchObject({
      state: "ambiguous",
      remedy: {
        argv: [
          "arc",
          "review",
          "change-request",
          "resolve",
          "--head-ref",
          unusualHeadRef,
          "--head-sha",
          movedHead,
        ],
        text: expect.stringContaining("'feat/operator'\"'\"'s-review'"),
      },
    });
  });

  it("finds an exact merged head after the local and remote branch refs disappear", async () => {
    await expect(resolveChangeRequest(request, port({
      readHeadRef: async () => ({ local: null, remote: null }),
      searchByHeadSha: async () => [candidate({ state: "MERGED", headRefName: "feat/renamed" })],
    }))).resolves.toMatchObject({
      state: "merged-at-head",
      nextAction: "complete",
      candidate: { headRefName: "feat/renamed", headRefOid: headSha },
    });
  });

  it("returns a typed stop when the host lookup fails", async () => {
    await expect(resolveChangeRequest(request, port({
      listByHead: async () => { throw new Error("authentication required"); },
    }))).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "host-failure",
    });
  });

  it("blocks a supplied head that matches neither the local nor remote branch ref", async () => {
    await expect(resolveChangeRequest(request, port({
      readHeadRef: async () => ({ local: "b".repeat(40), remote: "c".repeat(40) }),
    }))).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "head-mismatch",
    });
  });

  it("requires the remote branch itself to carry a pre-create head", async () => {
    await expect(resolveChangeRequest({ ...request, requireRemote: true }, port({
      readHeadRef: async () => ({ local: headSha, remote: null }),
    }))).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "head-mismatch",
      detail: expect.stringContaining("remote branch ref"),
    });
  });

  it("blocks a change request that targets a different configured base", async () => {
    await expect(resolveChangeRequest(request, port({
      listByHead: async () => [candidate({ baseRefName: "release" })],
    }))).resolves.toMatchObject({ state: "blocked", reason: "base-mismatch" });
  });

  it("accepts a caller-resolved delivery-member base", async () => {
    await expect(resolveChangeRequest({
      ...request,
      acceptableBaseRefs: ["delivery/plan-1/member-1"],
    }, port({
      listByHead: async () => [candidate({ baseRefName: "delivery/plan-1/member-1" })],
    }))).resolves.toMatchObject({
      state: "open",
      candidate: { number: 42, baseRefName: "delivery/plan-1/member-1" },
    });
  });

  it("still blocks an unrelated base when delivery-member bases are admitted", async () => {
    await expect(resolveChangeRequest({
      ...request,
      acceptableBaseRefs: ["delivery/plan-1/member-1"],
    }, port({
      listByHead: async () => [candidate({ baseRefName: "release" })],
    }))).resolves.toMatchObject({ state: "blocked", reason: "base-mismatch" });
  });

  it("selects the configured-base request when another base is also visible", async () => {
    await expect(resolveChangeRequest(request, port({
      listByHead: async () => [
        candidate({ number: 41, baseRefName: "release" }),
        candidate({ number: 42, baseRefName: "main" }),
      ],
    }))).resolves.toMatchObject({ state: "open", candidate: { number: 42, baseRefName: "main" } });
  });
});
