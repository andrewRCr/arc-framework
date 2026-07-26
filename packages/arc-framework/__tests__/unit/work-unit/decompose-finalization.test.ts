import { describe, expect, it } from "vitest";

import { canonicalDigest, canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import { contentDigest } from "../../../src/lib/canonical/content-digest.js";
import { validateManagedPath } from "../../../src/lib/canonical/managed-path.js";
import { preparationId, receiptId } from "../../../src/lib/canonical/receipt-id.js";
import {
  finalizeDecomposeRetirement,
  type DecomposeFinalizationContext,
  type DecomposeFinalizationProjection,
} from "../../../src/lib/work-unit/decompose-finalization.js";
import { decomposeInventoryDigests } from "../../../src/lib/work-unit/decompose-inventory.js";
import { queryRetirementDisposition } from "../../../src/lib/work-unit/retirement-disposition-query.js";
import { resolveRetirementRecordRelativePath } from "../../../src/lib/work-unit/retirement-record-store.js";
import type {
  DecomposePreparationLocator,
  DecomposePreparationRecord,
} from "../../../src/lib/work-unit/retirement-authority.js";

const bytes = (value: string) => new TextEncoder().encode(value);
const digest = (value: string) => contentDigest(bytes(value));
const targetPath = validateManagedPath(".arc/backlog/planned/origin/member-a/draft-member-a.md");
const scope = {
  subject: { kind: "work-unit" as const, name: "origin" },
  transition: "decompose" as const,
  source: { branch: "plan/origin", head: "a".repeat(40) },
  resultProjection: { ref: "main", head: "b".repeat(40) },
};
const sourcePath = validateManagedPath(".arc/active/draft-origin.md");
const sourceLocator = { artifact: "draft-origin.md", kind: "preamble" as const };
const sourceId = canonicalDigest({ schemaVersion: 2, sourcePath, sourceLocator });
const inventories = {
  sourceInventory: [{
    sourceId,
    sourcePath,
    sourceLocator,
    contentDigest: digest("source"),
  }],
  incomingEdgeInventory: [{ dependent: "consumer", currentTargets: ["other", "origin"] }],
  outgoingEdgeInventory: [{ prerequisite: "foundation" }],
};
const inventoryDigests = decomposeInventoryDigests(inventories);
const allocation = {
  schemaVersion: 2 as const,
  origin: { slug: "origin", phase: "Planning" as const, location: "active" as const },
  shape: "symmetric" as const,
  parentPosition: "standalone" as const,
  cohort: "origin",
  entries: [
    { kind: "new-member" as const, destinationId: "a", slug: "member-a", workClass: "Light" as const },
    { kind: "new-member" as const, destinationId: "b", slug: "member-b", workClass: "Light" as const },
  ],
  internalEdges: [],
  sourceAllocations: [{
    sourceId,
    ownership: "destination-owned" as const,
    disposition: {
      kind: "target" as const,
      destinationId: "a",
      targetLocator: { artifact: "draft-member-a.md", kind: "preamble" as const },
    },
  }],
  incomingEdges: [{
    dependent: "consumer",
    disposition: { kind: "replace" as const, replacementTargets: ["member-a"] },
  }],
  outgoingEdges: [{
    prerequisite: "foundation",
    disposition: { kind: "targets" as const, targets: ["member-a"] },
  }],
};
const receiptIdValue = receiptId({
  schemaVersion: 1,
  subject: scope.subject,
  transition: "decompose",
  sourceBranch: scope.source.branch,
  sourceHead: scope.source.head,
});
const cutMapDigest = canonicalDigest(allocation);
const locator: DecomposePreparationLocator = {
  receiptId: receiptIdValue,
  preparationId: preparationId({
    receiptId: receiptIdValue,
    baseHead: scope.resultProjection.head,
    ...inventoryDigests,
    cutMapDigest,
  }),
  scope,
};
const recordPath = resolveRetirementRecordRelativePath(locator.receiptId);
const record: DecomposePreparationRecord = {
  kind: "prepared-decompose",
  schemaVersion: 1,
  locator,
  allocation,
  ...inventories,
  allowedPaths: [targetPath],
  sourceArtifactDigest: digest("source-artifacts"),
  ...inventoryDigests,
  cutMapDigest,
};
const projection: DecomposeFinalizationProjection = {
  inventoryRead: "reachable",
  sourceArtifactDigest: record.sourceArtifactDigest,
  inventories,
  stagedPaths: [recordPath, targetPath],
  transitionPatch: [{ operation: "write", path: targetPath, contentDigest: digest("intro") }],
  targets: [{ path: ".arc/backlog/planned/origin/member-a", entries: [{ path: targetPath, state: "present", contentDigest: digest("intro") }] }],
  transformedIncomingDependents: ["consumer"],
};

function v2Fixture(inventoryRead: "tree-only" | "reachable" | "degraded") {
  const v2ReceiptId = receiptId({
    schemaVersion: 2,
    subject: scope.subject,
    transition: "decompose",
    sourceBranch: scope.source.branch,
    sourceHead: scope.source.head,
  });
  const v2Locator: DecomposePreparationLocator = {
    ...locator,
    receiptId: v2ReceiptId,
    preparationId: preparationId({
      receiptId: v2ReceiptId,
      baseHead: scope.resultProjection.head,
      ...inventoryDigests,
      cutMapDigest,
    }),
  };
  const v2Record: DecomposePreparationRecord = {
    ...record,
    schemaVersion: 2,
    inventoryRead,
    transformedIncomingDependents: ["consumer"],
    locator: v2Locator,
  };
  return {
    locator: v2Locator,
    record: v2Record,
    projection: {
      ...projection,
      inventoryRead,
      stagedPaths: [resolveRetirementRecordRelativePath(v2ReceiptId), targetPath],
    },
  };
}

function context(
  overrides: Partial<DecomposeFinalizationContext> = {},
  fixture: { record: DecomposePreparationRecord; projection: DecomposeFinalizationProjection } = {
    record,
    projection,
  },
) {
  const replacements: string[] = [];
  const ctx: DecomposeFinalizationContext = {
    readAuthoritySnapshot: async () => ({ authorityVersion: "prepared-version", recordState: "prepared-decompose" }),
    readRecord: async () => canonicalize(fixture.record),
    readProjection: async () => fixture.projection,
    readTargetArtifact: async () => bytes("intro"),
    readDependsOn: async (slug) => {
      if (slug === "consumer") return ["other", "member-a"];
      if (slug === "member-a") return ["foundation"];
      return [];
    },
    replaceAndStageRecord: async (_id, expected, next, stagedPaths) => {
      expect(expected).toBe(canonicalize(fixture.record));
      expect(stagedPaths).toEqual(fixture.projection.stagedPaths);
      replacements.push(next);
    },
    ...overrides,
  };
  return { ctx, replacements };
}

describe("finalizeDecomposeRetirement", () => {
  it("verifies the prepared result and atomically replaces it with a finalized receipt", async () => {
    const h = context();
    const result = await finalizeDecomposeRetirement(h.ctx, locator, "prepared-version");

    expect(result.status).toBe("recorded");
    if (result.status !== "recorded") return;
    expect(result.receipt).toMatchObject({
      receiptId: locator.receiptId,
      transition: "decompose",
      result: { kind: "decompose", preparationId: locator.preparationId },
    });
    expect(result.lifecycle).toEqual({
      subject: { slug: "origin", branch: "plan/origin" },
      transition: "decompose",
      authority: {
        kind: "receipt-backed",
        receiptId: locator.receiptId,
        authorityVersion: result.authorityVersion,
      },
      cleanup: {
        branch: { status: "pending" },
        worktree: { status: "pending" },
        userWorkspace: { status: "pending" },
      },
      successorReadiness: {
        candidates: ["member-b"],
        actionable: false,
        remedy: null,
      },
    });
    expect(queryRetirementDisposition({
      status: "valid",
      records: [{
        id: result.receipt.receiptId,
        content: "",
        record: { kind: "receipt", value: result.receipt },
      }],
    }, {
      retiredSubject: "origin",
      dependentSlug: "consumer",
    })).toMatchObject({
      status: "unique",
      disposition: { kind: "replace", replacementTargets: ["member-a"] },
    });
    expect(h.replacements).toEqual([canonicalize(result.receipt)]);
  });

  it("refuses authority drift, paths outside the prepared set, and mismatched final dependencies", async () => {
    expect(
      await finalizeDecomposeRetirement(
        context({ readAuthoritySnapshot: async () => ({ authorityVersion: "changed", recordState: "prepared-decompose" }) }).ctx,
        locator,
        "prepared-version",
      ),
    ).toMatchObject({ status: "refused", reason: "authority-conflict" });
    expect(
      await finalizeDecomposeRetirement(
        context({ readProjection: async () => ({ ...projection, stagedPaths: [...projection.stagedPaths, "outside.md"] }) }).ctx,
        locator,
        "prepared-version",
      ),
    ).toMatchObject({ status: "refused", reason: "evidence-mismatch" });
    expect(
      await finalizeDecomposeRetirement(
        context({ readProjection: async () => ({ ...projection, stagedPaths: [targetPath] }) }).ctx,
        locator,
        "prepared-version",
      ),
    ).toMatchObject({ status: "refused", reason: "evidence-mismatch" });
    expect(
      await finalizeDecomposeRetirement(
        context({ readDependsOn: async () => [] }).ctx,
        locator,
        "prepared-version",
      ),
    ).toMatchObject({ status: "refused", reason: "conservation-unproven" });
  });

  it("refuses a target locator that does not resolve in the declared artifact", async () => {
    const result = await finalizeDecomposeRetirement(
      context({ readTargetArtifact: async () => null }).ctx,
      locator,
      "prepared-version",
    );
    expect(result).toMatchObject({ status: "refused", reason: "conservation-unproven" });
  });

  it("does not require branch-private incoming edges to be mutated in the result checkout", async () => {
    const branchPrivateProjection = {
      ...projection,
      transformedIncomingDependents: [],
    };
    const result = await finalizeDecomposeRetirement(
      context({
        readProjection: async () => branchPrivateProjection,
        readDependsOn: async (slug) => slug === "member-a" ? ["foundation"] : [],
      }).ctx,
      locator,
      "prepared-version",
    );

    expect(result.status).toBe("recorded");
  });

  it("persists the transformed incoming-edge partition in v2 receipts", async () => {
    const fixture = v2Fixture("reachable");
    const result = await finalizeDecomposeRetirement(
      context({}, fixture).ctx,
      fixture.locator,
      "prepared-version",
    );

    expect(result).toMatchObject({
      status: "recorded",
      receipt: {
        schemaVersion: 2,
        result: { transformedIncomingDependents: ["consumer"] },
      },
    });
  });

  it("projects retirement cleanup as inapplicable for a branchless source", async () => {
    const branchlessAllocation = {
      ...record.allocation,
      origin: { ...record.allocation.origin, location: "planned" as const },
      shape: "backlog-stub-source" as const,
    };
    const branchlessCutMapDigest = canonicalDigest(branchlessAllocation);
    const branchlessLocator: DecomposePreparationLocator = {
      ...locator,
      preparationId: preparationId({
        receiptId: locator.receiptId,
        baseHead: locator.scope.resultProjection.head,
        ...inventoryDigests,
        cutMapDigest: branchlessCutMapDigest,
      }),
    };
    const branchlessRecord: DecomposePreparationRecord = {
      ...record,
      locator: branchlessLocator,
      allocation: branchlessAllocation,
      cutMapDigest: branchlessCutMapDigest,
    };
    const h = context({}, { record: branchlessRecord, projection });

    const result = await finalizeDecomposeRetirement(h.ctx, branchlessLocator, "prepared-version");

    expect(result.status).toBe("recorded");
    if (result.status !== "recorded") return;
    expect(result.lifecycle.subject.branch).toBeNull();
    expect(result.lifecycle.cleanup).toEqual({
      branch: { status: "not-applicable" },
      worktree: { status: "not-applicable" },
      userWorkspace: { status: "not-applicable" },
    });
  });

  it("binds finalization to the prepare-time transformed-dependent partition", async () => {
    const fixture = v2Fixture("reachable");
    const result = await finalizeDecomposeRetirement(
      context({
        readProjection: async () => ({
          ...fixture.projection,
          // A fresh post-mutation composition no longer exposes the retired edge.
          // Finalization must not silently replace the partition prepared earlier.
          transformedIncomingDependents: [],
        }),
      }, fixture).ctx,
      fixture.locator,
      "prepared-version",
    );

    expect(result).toMatchObject({ status: "refused", reason: "authority-conflict" });
  });

  it("refuses undeclared or duplicated dependencies on a new member", async () => {
    for (const dependencies of [
      ["foundation", "unexpected"],
      ["foundation", "foundation"],
    ]) {
      const result = await finalizeDecomposeRetirement(
        context({
          readDependsOn: async (slug) => {
            if (slug === "consumer") return ["other", "member-a"];
            if (slug === "member-a") return dependencies;
            return [];
          },
        }).ctx,
        locator,
        "prepared-version",
      );
      expect(result).toMatchObject({ status: "refused", reason: "conservation-unproven" });
    }
  });

  it("fails closed when transactional receipt replacement cannot stage", async () => {
    const result = await finalizeDecomposeRetirement(
      context({ replaceAndStageRecord: async () => { throw new Error("stage failed"); } }).ctx,
      locator,
      "prepared-version",
    );

    expect(result).toMatchObject({ status: "refused", reason: "authority-unavailable" });
  });

  it("preserves degraded preparation quality when the reachable inventory is unchanged", async () => {
    const fixture = v2Fixture("degraded");
    const h = context({}, fixture);

    const result = await finalizeDecomposeRetirement(h.ctx, fixture.locator, "prepared-version");

    expect(result).toMatchObject({
      status: "recorded",
      receipt: { schemaVersion: 2, inventoryRead: "degraded" },
    });
  });

  it("refuses reachable-to-degraded quality regression before replacing the preparation", async () => {
    const fixture = v2Fixture("reachable");
    const h = context({
      readProjection: async () => ({ ...fixture.projection, inventoryRead: "degraded" }),
    }, fixture);

    const result = await finalizeDecomposeRetirement(h.ctx, fixture.locator, "prepared-version");

    expect(result).toMatchObject({ status: "refused", reason: "authority-conflict" });
    expect(h.replacements).toEqual([]);
  });

  it("refuses a newly enlarged reachable inventory before replacing the preparation", async () => {
    const fixture = v2Fixture("reachable");
    const h = context({
      readProjection: async () => ({
        ...fixture.projection,
        inventories: {
          ...fixture.projection.inventories,
          incomingEdgeInventory: [
            ...fixture.projection.inventories.incomingEdgeInventory,
            { dependent: "new-consumer", currentTargets: ["origin"] },
          ],
        },
      }),
    }, fixture);

    const result = await finalizeDecomposeRetirement(h.ctx, fixture.locator, "prepared-version");

    expect(result).toMatchObject({ status: "refused", reason: "authority-conflict" });
    expect(h.replacements).toEqual([]);
  });
});
