/** Exact preservation and host authorization for ordinary Errand resume. */

import { describe, expect, it } from "vitest";

import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { TransientIdentityRecordV3Schema } from "../../../src/lib/errand/identity-record.js";
import { authorizeOrdinaryErrandResume } from "../../../src/lib/errand/open-runtime.js";
import type { OrdinaryErrandRecord } from "../../../src/lib/errand/identity-transitions.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

function parseOrdinaryErrandRecord(value: unknown): OrdinaryErrandRecord {
  const parsed = TransientIdentityRecordV3Schema.parse(value);
  if (parsed.kind !== "errand" || parsed.purpose !== "errand") {
    throw new Error("expected an ordinary Errand record");
  }
  return parsed;
}

const HEAD = "a".repeat(40);

function awaiting(): OrdinaryErrandRecord {
  return parseOrdinaryErrandRecord({
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
  });
}

function paused(): OrdinaryErrandRecord {
  return parseOrdinaryErrandRecord({
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
    state: "paused",
    savedHead: HEAD,
    changeRequest: null,
  });
}

function hostExec(overrides: Record<string, unknown> = {}): GitExec {
  return scriptGitExec([
    { match: ["config", "--get", "remote.origin.url"],
      responses: [{ stdout: "git@github.com:owner/repo.git\n", stderr: "" }] },
    { command: "gh", match: { prefix: ["pr", "list"] },
      responses: [{ stdout: JSON.stringify([{
          number: 7,
          state: "OPEN",
          baseRefName: "main",
          headRefName: "chore/fix-output",
          headRefOid: HEAD,
          reviewDecision: "CHANGES_REQUESTED",
          ...overrides,
        }]), stderr: "" }] },
  ]).exec;
}

function pausedExec(movedHead: string): GitExec {
  return scriptGitExec([
    { match: { prefix: ["check-ref-format"] }, responses: [{ stdout: "", stderr: "" }] },
    { match: { prefix: ["fetch"] }, responses: [{ stdout: "", stderr: "" }] },
    { match: { prefix: ["merge-base"] }, responses: [{ stdout: "", stderr: "" }] },
    { match: { prefix: ["rev-parse"] }, responses: [({ args }) => ({
      stdout: `${args[3]?.includes("refs/heads/") === true ? HEAD : movedHead}\n`, stderr: "",
    })] },
    { match: { prefix: ["update-ref", "-d"] }, responses: [{ stdout: "", stderr: "" }] },
  ]).exec;
}

function unavailableHostExec(): GitExec {
  return scriptGitExec([
    { match: ["config", "--get", "remote.origin.url"],
      responses: [{ stdout: "git@github.com:owner/repo.git\n", stderr: "" }] },
    { command: "gh", match: { prefix: ["pr", "list"] },
      responses: [() => { throw new Error("host unavailable"); }] },
  ]).exec;
}

describe("ordinary Errand resume authorization", () => {
  it("refuses a descendant paused remote tip under strict materialization re-entry", async () => {
    const movedHead = "b".repeat(40);
    const exec = pausedExec(movedHead);

    await expect(authorizeOrdinaryErrandResume(exec, "main", paused(), "advisory", "exact"))
      .resolves.toMatchObject({ kind: "refused", reason: expect.stringMatching(/exact remote head/iu) });
  });

  it("retains ancestry-based authorization for ordinary paused re-entry", async () => {
    const movedHead = "b".repeat(40);
    const exec = pausedExec(movedHead);

    await expect(authorizeOrdinaryErrandResume(exec, "main", paused()))
      .resolves.toMatchObject({ kind: "authorized", authorization: { remoteBranchTip: movedHead } });
  });

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

  it("refuses a moved head under strict materialization re-entry", async () => {
    await expect(authorizeOrdinaryErrandResume(
      hostExec({ headRefOid: "b".repeat(40) }),
      "main",
      awaiting(),
      "strict",
    )).resolves.toMatchObject({ kind: "refused", reason: expect.stringMatching(/changed-head/iu) });
  });

  it("warns and proceeds when the host is unreachable", async () => {
    const exec = unavailableHostExec();
    await expect(authorizeOrdinaryErrandResume(exec, "main", awaiting()))
      .resolves.toMatchObject({
        kind: "authorized",
        authorization: { kind: "unreachable" },
        advisory: expect.stringMatching(/confirm.*still open/iu),
      });
  });

  it("refuses an unreachable host under strict materialization re-entry", async () => {
    const exec = unavailableHostExec();
    await expect(authorizeOrdinaryErrandResume(exec, "main", awaiting(), "strict"))
      .resolves.toMatchObject({ kind: "refused", reason: expect.stringMatching(/unreachable/iu) });
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
