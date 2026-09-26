import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  SchemaError,
  canonicalDigest,
  createKernelRegistry,
} from "../../../../src/lib/kernel/index.js";
import {
  createReviewTarget,
} from "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { FrontlineRunRequestSchema } from
  "../../../../src/scripts/review-gate/core/frontline-run-command-schema.js";
import { ReviewChunkingResolveRequestSchema } from
  "../../../../src/scripts/review-gate/core/review-chunking-command-schema.js";
import {
  registerReviewDomainSchemas,
} from "../../../../src/scripts/review-gate/core/register-review-schemas.js";
import {
  assertReviewDurableRecordInventory,
} from "../../../../src/scripts/review-gate/core/schema-inventory.js";
import { reduceReviewRouting } from
  "../../../../src/scripts/review-gate/policy/routing.js";

const kernelIdentities = [
  "priority",
  "remote-evidence",
  "remote-failure-reason",
  "slug",
  "work-class",
  "work-unit-state",
];
const reviewIdentities = [
  "approved-disposition-record",
  "approved-disposition-set",
  "canonical-change",
  "canonical-change-set",
  "change-path-fact",
  "change-path-set",
  "disposition-approval",
  "disposition-report-item",
  "disposition-set",
  "disposition-set-preimage",
  "disposition-set-state",
  "finding-classification",
  "finding-disposition",
  "fix-authorization",
  "fix-authorization-consumption",
  "fix-authorization-preimage",
  "frontline-execution-outcome",
  "frontline-outcome-digest-preimage",
  "frontline-outcome-record",
  "frontline-phase-state",
  "review-frontline-run-request",
  "frontline-run-state",
  "lane-progress-state",
  "local-review-policy-binding",
  "local-review-policy-binding-digest-preimage",
  "local-review-source",
  "local-review-source-digest-preimage",
  "local-review-state",
  "merge-lock-command-error-envelope",
  "merge-lock-hold-envelope",
  "merge-lock-release-envelope",
  "merge-lock-resolve-envelope",
  "standard-review-contract",
  "standard-review-obligation-projection",
  "standard-review-rubric-digest-preimage",
  "project-routing-promotion",
  "proposed-disposition-set",
  "normalized-review-finding",
  "review-command-error-envelope",
  "review-chunking-resolve-envelope",
  "review-chunking-resolve-request",
  "review-change-request-resolve-result",
  "review-checks-await-result",
  "review-frontline-resolve-envelope",
  "review-frontline-resolve-request",
  "review-frontline-run-envelope",
  "review-hosted-await-envelope",
  "review-hosted-await-request",
  "review-hosted-request-envelope",
  "review-hosted-request-request",
  "review-hosted-settle-envelope",
  "review-hosted-settle-request",
  "review-local-attest-envelope",
  "review-local-attest-request",
  "review-local-prepare-envelope",
  "review-local-prepare-request",
  "review-local-resume-envelope",
  "review-local-resume-request",
  "review-merge-method-resolve-result",
  "review-reduce-envelope",
  "review-reduce-request",
  "review-respond-envelope",
  "review-respond-request",
  "review-assurance-input",
  "review-guidance-digest-preimage",
  "review-lifecycle-tail-proof",
  "review-method-activity",
  "review-operation-state",
  "review-planning-grooming-resolve-envelope",
  "review-planning-grooming-resolve-request",
  "review-policy-version-preimage",
  "review-pre-publication-envelope",
  "review-readiness-envelope",
  "review-readiness-request",
  "review-receipt",
  "review-receipt-ledger",
  "review-request",
  "review-request-id-preimage",
  "review-reduction-projection",
  "review-requirement",
  "review-requirement-id-preimage",
  "review-resolve-envelope",
  "review-resolve-request",
  "review-response-input",
  "review-response-plan",
  "review-rubric-overlay-resolution",
  "review-routing-decision",
  "review-routing-facts",
  "review-severity",
  "review-suspension-state",
  "review-status-result",
  "review-target",
  "review-target-id-preimage",
  "review-terminus-accept-request",
  "severity-gating-policy",
  "work-unit-review-assurance",
];

describe("review schema registration", () => {
  it("composes domain-owned schemas into a fresh kernel registry", () => {
    const registry = createKernelRegistry();

    expect(registerReviewDomainSchemas(registry)).toBe(registry);
    expect(registry.ids()).toEqual([...reviewIdentities, ...kernelIdentities].sort());
    for (const id of reviewIdentities) {
      expect(registry.get(id)).toBeDefined();
      expect(registry.meta(id)).toMatchObject({ id, migrationPosture: "strict-current" });
    }
    expect(registry.meta("review-severity")?.version).toBe(2);
    expect(registry.meta("review-target")?.version).toBe(2);
    expect(registry.meta("review-request")?.version).toBe(2);
    expect(registry.meta("review-requirement")?.version).toBe(2);
    expect(registry.meta("review-receipt")?.version).toBe(2);
    expect(registry.meta("review-receipt-ledger")?.version).toBe(2);
    expect(registry.meta("standard-review-rubric-digest-preimage")?.version).toBe(1);
    expect(registry.meta("review-guidance-digest-preimage")?.version).toBe(2);
    expect(registry.meta("review-policy-version-preimage")?.version).toBe(2);
    expect(registry.meta("review-lifecycle-tail-proof")?.version).toBe(2);
    expect(registry.meta("review-response-plan")?.version).toBe(2);
    expect(registry.meta("canonical-change-set")?.version).toBe(1);
  });

  it("leaves the kernel factory unchanged and rejects repeated composition", () => {
    const registry = createKernelRegistry();
    registerReviewDomainSchemas(registry);

    expect(() => registerReviewDomainSchemas(registry)).toThrowError(SchemaError);
    expect(createKernelRegistry().ids()).toEqual(kernelIdentities);
    expect(registry.ids()).toEqual([...reviewIdentities, ...kernelIdentities].sort());
  });

  it("rejects a durable-record inventory entry whose registered version diverges", () => {
    const registry = createKernelRegistry();
    registry.register(z.string(), {
      id: "review-target",
      version: 1,
      migrationPosture: "strict-current",
    });

    expect(() => assertReviewDurableRecordInventory(registry))
      .toThrow("review-target inventory version 2 does not match registered version 1");
  });

  it("round-trips both target kinds through the registered target schemas", () => {
    const registry = createKernelRegistry();
    registerReviewDomainSchemas(registry);
    const preimageSchema = registry.get("review-target-id-preimage");
    const targetSchema = registry.get("review-target");
    if (preimageSchema === undefined || targetSchema === undefined) {
      throw new Error("expected both target schemas to be registered");
    }

    for (const kind of ["change-set", "delivery-member"] as const) {
      const target = createReviewTarget({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        kind,
        repositoryId: "repo-1",
        baseRef: "main",
        diffBaseSha: "a".repeat(40),
        diffBaseTree: "b".repeat(40),
        headSha: "c".repeat(40),
        headTree: "d".repeat(40),
      });
      const { targetId, ...preimageFields } = target;
      const preimage = preimageSchema.parse({
        domain: "arc.review-gate.target-id/v2",
        ...preimageFields,
      });

      expect(targetSchema.parse(target)).toEqual(target);
      expect(preimage).toMatchObject({ kind });
      expect(canonicalDigest(preimage)).toBe(targetId);
    }

    expect(targetSchema.safeParse({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-slice",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: "a".repeat(40),
      diffBaseTree: "b".repeat(40),
      headSha: "c".repeat(40),
      headTree: "d".repeat(40),
      targetId: canonicalDigest({ target: "unrecognized-kind" }),
    }).success).toBe(false);
    expect(registry.meta("review-target")?.version).toBe(2);
    expect(registry.meta("review-target-id-preimage")?.version).toBe(2);
  });

  it("keeps scope selection exact-target and work-unit identity outside the request", () => {
    const target = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: "a".repeat(40),
      diffBaseTree: "b".repeat(40),
      headSha: "c".repeat(40),
      headTree: "d".repeat(40),
    });

    const coordinates = {
      kind: target.kind,
      baseRef: target.baseRef,
      diffBaseSha: target.diffBaseSha,
      headSha: target.headSha,
    };

    expect(ReviewChunkingResolveRequestSchema.parse({
      schemaVersion: 1,
      target: coordinates,
      scopeSelection: { mode: "chunked", target: coordinates },
    })).toMatchObject({ scopeSelection: { mode: "chunked", target: coordinates } });
    expect(ReviewChunkingResolveRequestSchema.safeParse({
      schemaVersion: 1,
      target: coordinates,
      workUnitId: "delivery-stack-topology",
    }).success).toBe(false);
    expect(ReviewChunkingResolveRequestSchema.safeParse({
      schemaVersion: 1,
      target,
    }).success).toBe(false);
  });

  it("registers only caller-held coordinates for the two public exact-target requests", () => {
    const registry = createKernelRegistry();
    registerReviewDomainSchemas(registry);
    const frontlineResolve = registry.get("review-frontline-resolve-request");
    expect(frontlineResolve).toBeDefined();
    const coordinates = {
      kind: "change-set" as const,
      baseRef: "main",
      diffBaseSha: "a".repeat(40),
      headSha: "c".repeat(40),
    };
    const facts = {
      schemaVersion: 1 as const,
      changeSetState: "known" as const,
      contentKind: "code-bearing" as const,
      reviewRisk: "routine" as const,
      changeDeterminacy: "ordinary" as const,
      ownership: "self" as const,
      surfaceAuthority: "ordinary" as const,
      assurance: { workContext: "errand" as const, workClass: "Light" as const },
      activity: { selfReview: true, frontlineReview: false },
    };
    const decision = reduceReviewRouting(facts);
    const resolution = {
      schemaVersion: 1,
      mode: "review-frontline-resolve",
      diagnostics: [],
      state: "skipped",
      nextAction: "none",
      payload: {
        routing: {
          facts,
          decision,
        },
        frontlineReview: {
          schemaVersion: 1,
          semanticsVersion: "frontline-review/v1",
          action: "skip",
          reasons: decision.reasons,
          source: null,
          maxPasses: 0,
          promptText: null,
        },
      },
    };

    const resolveRequest = {
      schemaVersion: 1,
      changeSet: facts,
      invocation: { mode: "inherit", sourceId: "coderabbit-cli" },
      target: coordinates,
    };
    expect(frontlineResolve?.safeParse(resolveRequest).success).toBe(true);
    const member = {
      ...resolveRequest,
      target: { ...coordinates, kind: "delivery-member" },
      vehicle: {
        kind: "delivery-member",
        planId: "11111111-1111-4111-8111-111111111111",
        deliverableId: `sha256:${"1".repeat(64)}`,
        workUnitId: "example",
        head: coordinates.headSha,
      },
    };
    expect(frontlineResolve?.safeParse(member).success).toBe(true);
    expect(frontlineResolve?.safeParse({ ...member, vehicle: undefined }).success).toBe(false);
    expect(frontlineResolve?.safeParse({ ...resolveRequest, maxPasses: 2 }).success).toBe(false);
    expect(frontlineResolve?.safeParse({
      ...resolveRequest, target: { ...coordinates, headTree: "d".repeat(40) },
    }).success).toBe(false);

    expect(FrontlineRunRequestSchema.parse({
      schemaVersion: 1,
      target: coordinates,
      resolution,
    })).toMatchObject({ target: coordinates });
    expect(FrontlineRunRequestSchema.parse({
      schemaVersion: 1,
      target: coordinates,
      resolution,
      retryOfOperationId: `sha256:${"a".repeat(64)}`,
    })).toMatchObject({ retryOfOperationId: `sha256:${"a".repeat(64)}` });
    expect(FrontlineRunRequestSchema.safeParse({
      schemaVersion: 1,
      target: coordinates,
      resolution,
      retryOfOperationId: "previous-run",
    }).success).toBe(false);
    for (const extra of [
      { repositoryId: "repo-1" },
      { diffBaseTree: "b".repeat(40) },
      { headTree: "d".repeat(40) },
      { targetId: `sha256:${"e".repeat(64)}` },
    ]) {
      expect(FrontlineRunRequestSchema.safeParse({
        schemaVersion: 1,
        target: { ...coordinates, ...extra },
        resolution,
      }).success).toBe(false);
    }
  });

  it("keeps review imports and vocabulary out of kernel schema modules", () => {
    const packageRoot = resolve(import.meta.dirname, "../../../..");
    for (const relativePath of [
      "src/lib/kernel/schema/registry.ts",
      "src/lib/kernel/schema/vocabulary.ts",
    ]) {
      const source = readFileSync(join(packageRoot, relativePath), "utf8");
      expect(source).not.toMatch(/review-gate|change-facts|review-routing|finding-disposition/u);
    }
  });
});
