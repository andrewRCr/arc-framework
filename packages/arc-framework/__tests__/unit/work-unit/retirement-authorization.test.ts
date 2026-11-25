import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../src/lib/kernel/canonical/canonical-json.js";
import { contentDigest } from "../../../src/lib/canonical/content-digest.js";
import {
  gitTransitionResultDigest,
  type RetirementEvidenceRef,
  type TeardownAuthorizationRequest,
} from "../../../src/lib/work-unit/retirement-authority.js";
import {
  authorizeRetirement,
  revalidateRetirementAuthorization,
  type GitTransitionAuthorizationProof,
  type RemoteSourceRefRelation,
  type RetirementAuthorizationContext,
} from "../../../src/lib/work-unit/retirement-authorization.js";

const head = "a".repeat(40);
const ancestor = "9".repeat(40);
const remote = "origin";

const workUnitRequest: TeardownAuthorizationRequest = {
  subject: { kind: "work-unit", name: "sample" },
  branch: "feat/sample",
  head,
  remote,
  requestedMode: "abandoned",
};

const shippedEvidence: Extract<RetirementEvidenceRef, { kind: "shipped" }> = {
  kind: "shipped",
  expectedLifecycle: "completed",
  resultDigest: contentDigest(new TextEncoder().encode("completed")),
  baseProofOid: "b".repeat(40),
};

function proof(
  transition: GitTransitionAuthorizationProof["transition"] = "abandon",
): GitTransitionAuthorizationProof {
  return {
    transition,
    retiringHead: head,
    resultHead: "c".repeat(40),
    resultInventory: [],
  };
}

function context(candidate = proof()): RetirementAuthorizationContext & {
  local: { oid: string; worktreeProjectionSafe: boolean };
  remoteRef: { relation: RemoteSourceRefRelation };
  candidate: { value: GitTransitionAuthorizationProof | null; refusal: "evidence-missing" | null };
} {
  const local = { oid: head, worktreeProjectionSafe: true };
  const remoteRef = { relation: { kind: "equal", oid: head } as RemoteSourceRefRelation };
  const candidateState = { value: candidate as GitTransitionAuthorizationProof | null, refusal: null };
  return {
    readLocalProjection: vi.fn(async () => ({ ...local })),
    readRemoteRef: vi.fn(async () => remoteRef.relation.kind === "absent" ? null : remoteRef.relation.oid),
    readRemoteSourceRef: vi.fn(async () => remoteRef.relation),
    readShippedEvidence: vi.fn().mockResolvedValue({
      evidence: shippedEvidence,
      remoteDisposition: "retain",
    }),
    readGitTransitionProof: async () => candidateState.refusal !== null
      ? { status: "refused", reason: candidateState.refusal }
      : candidateState.value === null
        ? { status: "refused", reason: "evidence-missing" }
        : { status: "proved", proof: candidateState.value },
    local,
    remoteRef,
    candidate: candidateState,
  };
}

describe("authorizeRetirement", () => {
  it("allows an exact branch subject only through merged-preserved shipped evidence", async () => {
    const ctx = context();
    const request: TeardownAuthorizationRequest = {
      ...workUnitRequest,
      subject: { kind: "branch", ref: "feat/sample" },
      requestedMode: "shipped",
    };

    const decision = await authorizeRetirement(ctx, request);

    expect(decision).toMatchObject({ status: "authorized", authorization: "merged-preserved" });
    await expect(
      authorizeRetirement(ctx, { ...request, requestedMode: "abandoned" }),
    ).resolves.toEqual({ status: "refused", reason: "unsupported-transition" });
  });

  it.each([
    ["abandon", "discard-confirmed"],
    ["park-planning", "planning-relocated"],
  ] as const)("authorizes a valid %s Git proof and marks a matching remote for deletion", async (transition, authorization) => {
    const candidate = proof(transition);
    const ctx = context(candidate);

    const decision = await authorizeRetirement(ctx, workUnitRequest);

    expect(decision).toMatchObject({
      status: "authorized",
      authorization,
      refs: {
        localOid: head,
        remote: { remote, oid: head, disposition: "delete" },
      },
      evidence: {
        kind: "git-transition",
        transition,
        resultDigest: gitTransitionResultDigest({
          transition,
          subject: workUnitRequest.subject,
          branch: workUnitRequest.branch,
          retiringHead: candidate.retiringHead,
          resultHead: candidate.resultHead,
          resultInventory: candidate.resultInventory,
        }),
      },
    });
  });

  it.each([
    ["an absent remote", { kind: "absent" }, null],
    [
      "a strict-ancestor remote",
      { kind: "strict-ancestor", oid: ancestor },
      { remote, oid: ancestor, disposition: "delete" },
    ],
  ] as const)("authorizes a valid Git transition with %s", async (_label, relation, expected) => {
    const ctx = context();
    ctx.remoteRef.relation = relation;

    const decision = await authorizeRetirement(ctx, workUnitRequest);

    expect(decision).toMatchObject({
      status: "authorized",
      refs: { localOid: head, remote: expected },
    });
  });

  it.each(["strict-descendant", "diverged"] as const)(
    "refuses a %s remote",
    async (kind) => {
      const ctx = context();
      ctx.remoteRef.relation = { kind, oid: "d".repeat(40) };

      await expect(authorizeRetirement(ctx, workUnitRequest)).resolves.toEqual({
        status: "refused",
        reason: "projection-mismatch",
      });
    },
  );

  it("refuses a foreign-owned same-name local branch", async () => {
    const ctx = context();
    ctx.local.worktreeProjectionSafe = false;
    await expect(authorizeRetirement(ctx, workUnitRequest)).resolves.toEqual({
      status: "refused",
      reason: "projection-mismatch",
    });
  });

  it("refuses a structural proof for a different retiring head", async () => {
    const ctx = context({ ...proof(), retiringHead: "d".repeat(40) });

    await expect(authorizeRetirement(ctx, workUnitRequest)).resolves.toEqual({
      status: "refused",
      reason: "projection-mismatch",
    });
  });

  it("refuses abandoned mode when no committed Git transition proves the result", async () => {
    const ctx = context();
    ctx.candidate.value = null;

    await expect(authorizeRetirement(ctx, workUnitRequest)).resolves.toEqual({
      status: "refused",
      reason: "evidence-missing",
    });
  });

  it("preserves a structural proof refusal without manufacturing evidence", async () => {
    const ctx = context();
    ctx.candidate.refusal = "evidence-missing";

    await expect(authorizeRetirement(ctx, workUnitRequest)).resolves.toEqual({
      status: "refused",
      reason: "evidence-missing",
    });
  });

  it("refuses a park proof whose effective base lacks the conserved result", async () => {
    const ctx = context(proof("park-planning"));
    ctx.candidate.refusal = "evidence-missing";

    await expect(authorizeRetirement(ctx, workUnitRequest)).resolves.toEqual({
      status: "refused",
      reason: "evidence-missing",
    });
  });

  it.each([
    ["absent", { kind: "absent" }, "retain", null],
    ["equal", { kind: "equal", oid: head }, "delete", { remote, oid: head, disposition: "delete" }],
    ["equal", { kind: "equal", oid: head }, "retain", { remote, oid: head, disposition: "retain" }],
  ] as const)("resolves a shipped remote as %s / %s", async (_label, relation, disposition, expected) => {
    const ctx = context();
    ctx.remoteRef.relation = relation;
    vi.mocked(ctx.readShippedEvidence).mockResolvedValue({
      evidence: shippedEvidence,
      remoteDisposition: disposition,
    });
    const request = { ...workUnitRequest, requestedMode: "shipped" } as const;

    const decision = await authorizeRetirement(ctx, request);

    expect(decision).toMatchObject({
      status: "authorized",
      authorization: "merged-preserved",
      refs: { remote: expected },
    });
  });
});

describe("revalidateRetirementAuthorization", () => {
  it.each([
    ["local ref", (ctx: ReturnType<typeof context>) => { ctx.local.oid = "d".repeat(40); }],
    ["remote ref", (ctx: ReturnType<typeof context>) => { ctx.remoteRef.relation = { kind: "absent" }; }],
    ["transition", (ctx: ReturnType<typeof context>) => { ctx.candidate.value = proof("park-planning"); }],
  ] as const)("returns authority-conflict after a %s change without mutating branch state", async (_label, mutate) => {
    const ctx = context();
    const initial = await authorizeRetirement(ctx, workUnitRequest);
    if (initial.status !== "authorized") throw new Error("expected authorization");
    const branchState = { branched: true };

    mutate(ctx);

    await expect(
      revalidateRetirementAuthorization(ctx, workUnitRequest, initial),
    ).resolves.toEqual({ status: "refused", reason: "authority-conflict" });
    expect(branchState.branched).toBe(true);
  });

  it("accepts the unchanged exact authorization version and refs", async () => {
    const ctx = context();
    const initial = await authorizeRetirement(ctx, workUnitRequest);
    if (initial.status !== "authorized") throw new Error("expected authorization");

    expect(initial.authorityVersion).toBe(canonicalDigest({
      request: workUnitRequest,
      authorization: initial.authorization,
      evidence: initial.evidence,
      refs: initial.refs,
    }));
    await expect(
      revalidateRetirementAuthorization(ctx, workUnitRequest, initial),
    ).resolves.toEqual({ status: "valid" });
  });
});
