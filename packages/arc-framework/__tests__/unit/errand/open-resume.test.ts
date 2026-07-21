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
    dispatchId: null,
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
  it("authorizes only exact requested-work truth for an awaiting tail", async () => {
    await expect(authorizeOrdinaryErrandResume(hostExec(), "main", awaiting()))
      .resolves.toMatchObject({ kind: "authorized", authorization: { kind: "requested-work" } });
  });

  it.each([
    ["open", { reviewDecision: "" }, "open"],
    ["merged", { state: "MERGED", reviewDecision: "" }, "merged"],
    ["changed head", { headRefOid: "b".repeat(40) }, "changed-head"],
  ] as const)("refuses %s host truth", async (_label, overrides, expected) => {
    await expect(authorizeOrdinaryErrandResume(hostExec(overrides), "main", awaiting()))
      .resolves.toMatchObject({ kind: "refused", reason: expect.stringContaining(expected) });
  });

  it("refuses an unreachable host", async () => {
    const exec: GitExec = async (command) => {
      if (command === "git") return { stdout: "git@github.com:owner/repo.git\n", stderr: "" };
      throw new Error("host unavailable");
    };
    await expect(authorizeOrdinaryErrandResume(exec, "main", awaiting()))
      .resolves.toMatchObject({ kind: "refused", reason: expect.stringContaining("unreachable") });
  });
});
