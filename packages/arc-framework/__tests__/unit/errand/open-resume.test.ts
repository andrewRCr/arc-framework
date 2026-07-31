/** Exact preservation and host authorization for ordinary Errand resume. */

import { describe, expect, it } from "vitest";

import { TransientIdentityRecordV3Schema } from "../../../src/lib/errand/identity-record.js";
import { authorizeOrdinaryErrandResume } from "../../../src/lib/errand/open-runtime.js";
import type { OrdinaryErrandRecord } from "../../../src/lib/errand/identity-transitions.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const HEAD = "a".repeat(40);

function awaiting(): OrdinaryErrandRecord {
  return TransientIdentityRecordV3Schema.parse({
    version: 3,
    slug: "fix-output",
    claimId: "c".repeat(32),
    createdAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T12:01:00.000Z",
    kind: "errand",
    purpose: "errand",
    intent: "fix output",
    branch: "chore/fix-output",
    origin: "description",
    originEntry: null,
    state: "awaiting-merge",
    savedHead: null,
    changeRequest: {
      repositoryRef: "owner/repo",
      hostRef: "github.com",
      baseRef: "main",
      headRef: "chore/fix-output",
      headSha: HEAD,
    },
  }) as OrdinaryErrandRecord;
}

function hostExec(overrides: Record<string, unknown> = {}): GitExec {
  return async (command) => command === "git"
    ? { stdout: "git@github.com:owner/repo.git\n", stderr: "" }
    : {
        stdout: JSON.stringify([{
          number: 7,
          state: "OPEN",
          baseRefName: "main",
          headRefName: "chore/fix-output",
          headRefOid: HEAD,
          reviewDecision: "CHANGES_REQUESTED",
          ...overrides,
        }]),
        stderr: "",
      };
}

describe("ordinary Errand resume authorization", () => {
  it.each([
    ["requested work", {}, "requested-work"],
    ["ordinary open review", { reviewDecision: "" }, "open"],
  ] as const)("authorizes an exact %s change request", async (_label, overrides, expected) => {
    await expect(authorizeOrdinaryErrandResume(hostExec(overrides), "main", awaiting()))
      .resolves.toMatchObject({ kind: "authorized", authorization: { kind: expected } });
  });

  it("warns and proceeds when an open change request head moved", async () => {
    await expect(authorizeOrdinaryErrandResume(hostExec({ headRefOid: "b".repeat(40) }), "main", awaiting()))
      .resolves.toMatchObject({
        kind: "authorized",
        authorization: { kind: "changed-head" },
        advisory: expect.stringMatching(/head moved/iu),
      });
  });

  it("warns and proceeds when the host is unreachable", async () => {
    const exec: GitExec = async (command) => {
      if (command === "git") return { stdout: "git@github.com:owner/repo.git\n", stderr: "" };
      throw new Error("host unavailable");
    };
    await expect(authorizeOrdinaryErrandResume(exec, "main", awaiting()))
      .resolves.toMatchObject({
        kind: "authorized",
        authorization: { kind: "unreachable" },
        advisory: expect.stringMatching(/confirm.*still open/iu),
      });
  });

  it.each([
    ["merged", { state: "MERGED", reviewDecision: "" },
      "Host truth is merged, not an open change request."],
    ["closed without merge", { state: "CLOSED", reviewDecision: "" },
      "Host truth is closed-unmerged, not an open change request."],
  ] as const)("refuses %s host truth", async (_label, overrides, expected) => {
    await expect(authorizeOrdinaryErrandResume(hostExec(overrides), "main", awaiting()))
      .resolves.toEqual({ kind: "refused", reason: expected });
  });
});
