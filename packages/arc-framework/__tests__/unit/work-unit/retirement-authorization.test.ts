import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import { contentDigest } from "../../../src/lib/canonical/content-digest.js";
import type {
  RetirementEvidenceRef,
  RetirementReceipt,
  TeardownAuthorizationRequest,
} from "../../../src/lib/work-unit/retirement-authority.js";
import {
  authorizeRetirement,
  revalidateRetirementAuthorization,
  type RetirementAuthorizationContext,
} from "../../../src/lib/work-unit/retirement-authorization.js";

const head = "a".repeat(40);
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

function receipt(
  transition: "abandon" | "park-planning" = "abandon",
): RetirementReceipt {
  const parked = transition === "park-planning";
  return {
    schemaVersion: 1,
    receiptId: contentDigest(new TextEncoder().encode(`${transition}-receipt`)),
    subject: { kind: "work-unit", name: "sample" },
    transition,
    source: {
      branch: "feat/sample",
      head: "0".repeat(40),
      artifactDigest: contentDigest(new TextEncoder().encode("source")),
    },
    transitionPatchDigest: contentDigest(new TextEncoder().encode("patch")),
    retiringProjection: { kind: "direct-transition" },
    authorization: parked ? "planning-relocated" : "discard-confirmed",
    result: parked
      ? { kind: "relocate", plannedArtifactDigest: contentDigest(new TextEncoder().encode("planned")) }
      : { kind: "discard", artifactDigest: "absent" },
  };
}

function context(candidate = receipt()): RetirementAuthorizationContext & {
  local: { oid: string; ownedByRetiringWorktree: boolean };
  remoteRef: { oid: string | null };
  candidate: { value: RetirementReceipt | null };
} {
  const local = { oid: head, ownedByRetiringWorktree: true };
  const remoteRef = { oid: head as string | null };
  const candidateState = { value: candidate as RetirementReceipt | null };
  return {
    readLocalProjection: vi.fn(async () => ({ ...local })),
    readRemoteRef: vi.fn(async () => remoteRef.oid),
    readShippedEvidence: vi.fn().mockResolvedValue({
      evidence: shippedEvidence,
      remoteDisposition: "retain",
    }),
    readReceiptCandidates: vi.fn(async () => candidateState.value === null
      ? []
      : [{ receipt: candidateState.value, resultHead: "c".repeat(40) }]),
    validateReceiptRelation: vi.fn().mockResolvedValue(null),
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
  ] as const)("authorizes a valid %s receipt and marks a matching remote for deletion", async (transition, authorization) => {
    const ctx = context(receipt(transition));

    const decision = await authorizeRetirement(ctx, workUnitRequest);

    expect(decision).toMatchObject({
      status: "authorized",
      authorization,
      refs: {
        localOid: head,
        remote: { remote, oid: head, disposition: "delete" },
      },
      evidence: {
        kind: "receipt",
        transition,
        expectedLifecycle: transition === "park-planning" ? "planned" : "nonexistent",
      },
    });
  });

  it("refuses an advanced remote or a foreign-owned same-name local branch", async () => {
    const ctx = context();
    ctx.remoteRef.oid = "d".repeat(40);
    await expect(authorizeRetirement(ctx, workUnitRequest)).resolves.toEqual({
      status: "refused",
      reason: "projection-mismatch",
    });

    ctx.remoteRef.oid = head;
    ctx.local.ownedByRetiringWorktree = false;
    await expect(authorizeRetirement(ctx, workUnitRequest)).resolves.toEqual({
      status: "refused",
      reason: "projection-mismatch",
    });
  });

  it.each([
    [null, "retain", null],
    [head, "delete", { remote, oid: head, disposition: "delete" }],
    [head, "retain", { remote, oid: head, disposition: "retain" }],
  ] as const)("resolves a shipped remote as %s / %s", async (remoteOid, disposition, expected) => {
    const ctx = context();
    ctx.remoteRef.oid = remoteOid;
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
    ["remote ref", (ctx: ReturnType<typeof context>) => { ctx.remoteRef.oid = null; }],
    ["receipt", (ctx: ReturnType<typeof context>) => { ctx.candidate.value = receipt("park-planning"); }],
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
