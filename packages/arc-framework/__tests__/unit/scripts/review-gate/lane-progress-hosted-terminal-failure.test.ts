import { describe, expect, it } from "vitest";

import { CanonicalDigestSchema } from "../../../../src/lib/kernel/index.js";
import { createReviewRequirement, createReviewTarget } from "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewOperationState } from "../../../../src/scripts/review-gate/core/operation-state-schema.js";
import type { HostedAdmission, HostedProviderId, HostedRequestEnvelope } from "../../../../src/scripts/review-gate/hosted/request.js";
import { recordHostedRequestAdmission, recordHostedRequestConclusion } from "../../../../src/scripts/review-gate/lane-progress.js";

const oid = (digit: string) => digit.repeat(40);
const firstHead = oid("c");
const laterHead = oid("f");
const failureReason = "provider-body-finding-severity-unrecognized";

const standardReview = {
  obligation: "required" as const,
  reasons: ["sensitive-change-set" as const],
  rubricVersion: "standard-review/v1",
  rubricDigest: CanonicalDigestSchema.parse(`sha256:${"e".repeat(64)}`),
  retrigger: "full-final" as const,
  count: 1 as const,
};
const errandVehicle = {
  kind: "errand" as const,
  key: "errand-one",
  claimId: "claim-1",
  branch: "chore/errand-one",
  sources: ["coderabbit-pr" as const, "codex-pr" as const],
  standardReview,
};

function createStore() {
  const records = new Map<string, { version: number; state: ReviewOperationState }>();
  return {
    readOperation: async (operationId: string) => {
      const record = records.get(operationId);
      return { version: record?.version ?? 0, state: record?.state ?? null };
    },
    publishOperation: async (state: ReviewOperationState, expectedVersion: number) => {
      const current = records.get(state.operationId)?.version ?? 0;
      if (current !== expectedVersion) throw new Error("version-conflict");
      const version = current + 1;
      records.set(state.operationId, { version, state });
      return { version };
    },
    readOperationSnapshot: async () => ({ status: "complete" as const, records: [...records.values()] }),
  };
}

function reviewContextAt(headSha: string) {
  const reviewTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: oid("a"),
    diffBaseTree: oid("b"),
    headSha,
    headTree: headSha === firstHead ? oid("d") : oid("7"),
  });
  const requirement = createReviewRequirement({
    target: reviewTarget,
    projection: standardReview,
    acceptableSources: [
      { sourceKind: "hosted", qualifier: "coderabbit-pr" },
      { sourceKind: "hosted", qualifier: "codex-pr" },
    ],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected hosted review requirement");
  return { reviewTarget, requirement };
}

function admit(
  store: ReturnType<typeof createStore>,
  input: { headSha: string; provider: HostedProviderId; coverage?: "complete" | "incremental"; now: string },
) {
  const coverage = input.coverage ?? "complete";
  const request: HostedRequestEnvelope = {
    schemaVersion: 1,
    target: { repository: "andrewRCr/arc-framework", pullRequest: 42, headSha: input.headSha },
    provider: input.provider,
    coverage,
    ...(coverage === "incremental"
      ? {
          correctionScope: {
            schemaVersion: 1 as const,
            predecessorProducerId: "prior-review",
            predecessorHeadSha: oid("9"),
            basisHeadSha: oid("9"),
            headSha: input.headSha,
            requiredFindings: [],
          },
        }
      : {}),
    vehicle: { kind: "errand", standardReview },
  };
  return recordHostedRequestAdmission(store, {
    repositoryId: "repo-1",
    lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: errandVehicle.claimId, headSha: input.headSha },
    request,
    progressVehicle: errandVehicle,
    ...reviewContextAt(input.headSha),
    actorIdentity: "github-user-1",
    authorizeCapacity: async () => undefined,
    now: input.now,
  });
}

async function admitted(decision: ReturnType<typeof admit>): Promise<HostedAdmission> {
  const resolved = await decision;
  if (resolved.state !== "admitted") throw new Error(`expected hosted admission, got ${resolved.state}`);
  return resolved.admission;
}

async function conclude(
  store: ReturnType<typeof createStore>,
  admission: HostedAdmission,
  state: "terminal-failure" | "ambiguous-delivery",
) {
  const base = {
    schemaVersion: 1 as const,
    mode: "review-hosted-request" as const,
    nextAction: "stop" as const,
    provider: admission.sourceId,
    requestedCoverage: admission.requestedCoverage,
    attemptedProviders: [admission.sourceId],
  };
  return recordHostedRequestConclusion(store, {
    admission,
    result: state === "terminal-failure"
      ? { ...base, state, reason: failureReason }
      : { ...base, state },
    now: "2026-10-08T12:01:00Z",
  });
}

describe("hosted admission after a terminal failure", () => {
  it.each(["coderabbit-pr", "codex-pr"] as const)(
    "admits the same pass from %s at a later head",
    async (provider) => {
      const store = createStore();
      const failed = await admitted(admit(store, { headSha: firstHead, provider: "coderabbit-pr", now: "2026-10-08T12:00:00Z" }));
      await conclude(store, failed, "terminal-failure");

      await expect(admit(store, { headSha: laterHead, provider, now: "2026-10-08T12:02:00Z" })).resolves.toMatchObject({
        state: "admitted",
        admission: { logicalPass: 1, sourceId: provider, target: { headSha: laterHead } },
      });
    },
  );

  it("admits a later head's coverage independently of the failed attempt's coverage", async () => {
    const store = createStore();
    const failed = await admitted(admit(store, {
      headSha: firstHead, provider: "coderabbit-pr", coverage: "incremental", now: "2026-10-08T12:00:00Z",
    }));
    await conclude(store, failed, "terminal-failure");

    await expect(admit(store, { headSha: laterHead, provider: "codex-pr", now: "2026-10-08T12:02:00Z" }))
      .resolves.toMatchObject({ state: "admitted", admission: { logicalPass: 1, requestedCoverage: "complete" } });
  });

  it("reports another source's request at the failed head as a terminal failure naming the failed attempt", async () => {
    const store = createStore();
    const failed = await admitted(admit(store, { headSha: firstHead, provider: "coderabbit-pr", now: "2026-10-08T12:00:00Z" }));
    await conclude(store, failed, "terminal-failure");

    const decision = await admit(store, { headSha: firstHead, provider: "codex-pr", now: "2026-10-08T12:02:00Z" });

    expect(decision).toMatchObject({
      state: "concluded",
      result: { state: "terminal-failure", nextAction: "stop", provider: "codex-pr", attemptedProviders: ["codex-pr"] },
    });
    const reason = decision.state === "concluded" && decision.result.state === "terminal-failure"
      ? decision.result.reason
      : "";
    expect(reason).toContain("coderabbit-pr");
    expect(reason).toContain(failed.admissionId);
    expect(reason).toContain(failureReason);
  });

  it("reports a different-coverage request at the failed head as the terminal failure", async () => {
    const store = createStore();
    const failed = await admitted(admit(store, { headSha: firstHead, provider: "coderabbit-pr", now: "2026-10-08T12:00:00Z" }));
    await conclude(store, failed, "terminal-failure");

    const decision = await admit(store, {
      headSha: firstHead, provider: "codex-pr", coverage: "incremental", now: "2026-10-08T12:02:00Z",
    });

    expect(decision).toMatchObject({
      state: "concluded",
      result: { state: "terminal-failure", nextAction: "stop", provider: "codex-pr", requestedCoverage: "incremental" },
    });
    expect(decision.state === "concluded" && decision.result.state === "terminal-failure"
      ? decision.result.reason
      : "").toContain(failed.admissionId);
  });

  it("replays the failed source's own request at the failed head unchanged", async () => {
    const store = createStore();
    const failed = await admitted(admit(store, { headSha: firstHead, provider: "coderabbit-pr", now: "2026-10-08T12:00:00Z" }));
    await conclude(store, failed, "terminal-failure");

    await expect(admit(store, { headSha: firstHead, provider: "coderabbit-pr", now: "2026-10-08T12:02:00Z" }))
      .resolves.toMatchObject({ state: "concluded", result: { state: "terminal-failure", reason: failureReason } });
  });

  it.each(["pending", "ambiguous-delivery"] as const)(
    "keeps a %s attempt at an earlier head blocking the pass",
    async (outcome) => {
      const store = createStore();
      const earlier = await admitted(admit(store, { headSha: firstHead, provider: "coderabbit-pr", now: "2026-10-08T12:00:00Z" }));
      if (outcome === "ambiguous-delivery") await conclude(store, earlier, outcome);

      await expect(admit(store, { headSha: laterHead, provider: "codex-pr", now: "2026-10-08T12:02:00Z" }))
        .resolves.toEqual({ state: "ambiguous-delivery" });
    },
  );
});
