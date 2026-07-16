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
  sourceArtifactDigest: record.sourceArtifactDigest,
  inventories,
  stagedPaths: [recordPath, targetPath],
  transitionPatch: [{ operation: "write", path: targetPath, contentDigest: digest("intro") }],
  targets: [{ path: ".arc/backlog/planned/origin/member-a", entries: [{ path: targetPath, state: "present", contentDigest: digest("intro") }] }],
};

function context(overrides: Partial<DecomposeFinalizationContext> = {}) {
  const replacements: string[] = [];
  const ctx: DecomposeFinalizationContext = {
    readAuthoritySnapshot: async () => ({ authorityVersion: "prepared-version", recordState: "prepared-decompose" }),
    readRecord: async () => canonicalize(record),
    readProjection: async () => projection,
    readTargetArtifact: async () => bytes("intro"),
    readDependsOn: async (slug) => {
      if (slug === "consumer") return ["other", "member-a"];
      if (slug === "member-a") return ["foundation"];
      return [];
    },
    replaceAndStageRecord: async (_id, expected, next, stagedPaths) => {
      expect(expected).toBe(canonicalize(record));
      expect(stagedPaths).toEqual(projection.stagedPaths);
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
});
