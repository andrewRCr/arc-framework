import { describe, expect, it } from "vitest";

import { canonicalDigest, canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import { validateManagedPath } from "../../../src/lib/canonical/managed-path.js";
import { contentDigest } from "../../../src/lib/canonical/content-digest.js";
import { receiptId } from "../../../src/lib/canonical/receipt-id.js";
import {
  parseDecomposePreparationRecord,
  prepareDecomposeRetirement,
  type DecomposePreparationContext,
  type DecomposePreparationProjection,
} from "../../../src/lib/work-unit/decompose-preparation.js";
import { resolveRetirementRecordRelativePath } from "../../../src/lib/work-unit/retirement-record-store.js";
import type { DecomposeAllocationMap } from "../../../src/lib/work-unit/decompose-cut-map.js";
import type { RetirementAuthorityScope } from "../../../src/lib/work-unit/retirement-authority.js";

const digest = (value: string) => contentDigest(new TextEncoder().encode(value));
const sourcePath = validateManagedPath(".arc/active/draft-origin.md");
const sourceLocator = { artifact: "draft-origin.md", kind: "preamble" as const };
const SOURCE_ID = canonicalDigest({ schemaVersion: 2, sourcePath, sourceLocator });

const scope: RetirementAuthorityScope = {
  subject: { kind: "work-unit", name: "origin" },
  transition: "decompose",
  source: { branch: "plan/origin", head: "a".repeat(40) },
  resultProjection: { ref: "main", head: "b".repeat(40) },
};

const allocation: DecomposeAllocationMap = {
  schemaVersion: 2,
  origin: { slug: "origin", phase: "Planning", location: "active" },
  shape: "symmetric",
  parentPosition: "standalone",
  cohort: "origin",
  entries: [
    { kind: "new-member", destinationId: "a", slug: "member-a", workClass: "Light" },
    { kind: "new-member", destinationId: "b", slug: "member-b", workClass: "Light" },
  ],
  internalEdges: [],
  sourceAllocations: [{
    sourceId: SOURCE_ID,
    ownership: "destination-owned",
    disposition: { kind: "drop", reason: "superseded" },
  }],
  incomingEdges: [
    { dependent: "consumer", disposition: { kind: "replace", replacementTargets: ["member-a"] } },
  ],
  outgoingEdges: [
    { prerequisite: "foundation", disposition: { kind: "targets", targets: ["member-a"] } },
  ],
};

const projection: DecomposePreparationProjection = {
  sourceArtifactDigest: digest("source-artifacts"),
  inventories: {
    sourceInventory: [
      {
        sourceId: SOURCE_ID,
        sourcePath,
        sourceLocator,
        contentDigest: digest("source-content"),
      },
    ],
    incomingEdgeInventory: [{ dependent: "consumer", currentTargets: ["other", "origin"] }],
    outgoingEdgeInventory: [{ prerequisite: "foundation" }],
  },
  allowedPaths: [
    validateManagedPath(".arc/active/draft-origin.md"),
    validateManagedPath(".arc/backlog/planned/origin/member-a/meta-member-a.md"),
  ],
};

interface Harness {
  ctx: DecomposePreparationContext;
  operations: string[];
  record: string | null;
  staged: string[];
  failStage: boolean;
  failRemove: boolean;
}

function harness(overrides: { version?: string; state?: "absent" | "prepared-decompose" } = {}): Harness {
  const operations: string[] = [];
  let record: string | null = null;
  let staged: string[] = [];
  let state = overrides.state ?? "absent";
  let version = overrides.version ?? "version-absent";
  const h: Harness = {
    operations,
    get record() { return record; },
    set record(value) { record = value; },
    get staged() { return staged; },
    set staged(value) { staged = value; },
    failStage: false,
    failRemove: false,
    ctx: {
      readAuthoritySnapshot: async () => ({ authorityVersion: version, recordState: state }),
      readProjection: async () => projection,
      readStagedPaths: async () => staged,
      readRecord: async () => record,
      createRecord: async (_receiptId, content) => {
        operations.push("create-record");
        if (record !== null) throw Object.assign(new Error("exists"), { code: "EEXIST" });
        record = content;
      },
      removeRecord: async () => {
        operations.push("remove-record");
        if (h.failRemove) throw new Error("remove failed");
        record = null;
      },
      stagePaths: async (paths) => {
        operations.push("stage-record");
        if (h.failStage) throw new Error("stage failed");
        staged = [...paths];
        state = "prepared-decompose";
        version = "version-prepared";
      },
    },
  };
  return h;
}

describe("prepareDecomposeRetirement", () => {
  it("writes and stages a complete deterministic preparation before returning its only token", async () => {
    const h = harness();
    const result = await prepareDecomposeRetirement(h.ctx, scope, allocation, "version-absent");

    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") return;
    expect(h.operations).toEqual(["create-record", "stage-record"]);
    expect(result.preparation.authorityVersion).toBe("version-prepared");
    expect(result.preparation.record).toMatchObject({
      kind: "prepared-decompose",
      schemaVersion: 1,
      allocation,
      sourceInventory: projection.inventories.sourceInventory,
      incomingEdgeInventory: projection.inventories.incomingEdgeInventory,
      outgoingEdgeInventory: projection.inventories.outgoingEdgeInventory,
      sourceArtifactDigest: projection.sourceArtifactDigest,
    });
    expect(result.preparation.locator.scope).toEqual(scope);
    expect(h.record).toBe(canonicalize(result.preparation.record));
    expect(h.staged).toEqual([resolveRetirementRecordRelativePath(result.preparation.locator.receiptId)]);
  });

  it("strictly decodes only the canonical preparation and its deterministic identities", async () => {
    const h = harness();
    const prepared = await prepareDecomposeRetirement(h.ctx, scope, allocation, "version-absent");
    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared" || h.record === null) return;

    expect(parseDecomposePreparationRecord(h.record, prepared.preparation.locator.receiptId)).toEqual(
      prepared.preparation.record,
    );
    const raw = JSON.parse(h.record) as Record<string, unknown>;
    const locator = raw.locator as Record<string, unknown>;
    const sourceInventory = raw.sourceInventory as Array<Record<string, unknown>>;
    const allowedPaths = raw.allowedPaths as string[];
    const cases = [
      { ...raw, unexpected: true },
      { ...raw, locator: { ...locator, receiptId: canonicalDigest("forged-receipt") } },
      {
        ...raw,
        sourceInventory: [
          { ...sourceInventory[0], sourceId: canonicalDigest("forged-source") },
          ...sourceInventory.slice(1),
        ],
      },
      { ...raw, allowedPaths: [...allowedPaths, allowedPaths[0]] },
      { ...raw, allocation: { schemaVersion: 2 } },
    ];
    for (const candidate of cases) {
      expect(parseDecomposePreparationRecord(canonicalize(candidate))).toBeNull();
    }
  });

  it("round-trips a source inventory locator for a bare H2", async () => {
    const bareHeadingLocator = {
      artifact: "draft-origin.md",
      kind: "section" as const,
      headingSource: "",
      occurrence: 0,
    };
    const bareSourceId = canonicalDigest({
      schemaVersion: 2,
      sourcePath,
      sourceLocator: bareHeadingLocator,
    });
    const bareAllocation: DecomposeAllocationMap = {
      ...allocation,
      sourceAllocations: [{
        sourceId: bareSourceId,
        ownership: "destination-owned",
        disposition: { kind: "drop", reason: "superseded" },
      }],
    };
    const h = harness();
    h.ctx.readProjection = async () => ({
      ...projection,
      inventories: {
        ...projection.inventories,
        sourceInventory: [{
          sourceId: bareSourceId,
          sourcePath,
          sourceLocator: bareHeadingLocator,
          contentDigest: digest("##\nbody\n"),
        }],
      },
    });

    const prepared = await prepareDecomposeRetirement(h.ctx, scope, bareAllocation, "version-absent");

    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared" || h.record === null) return;
    expect(parseDecomposePreparationRecord(h.record)).toEqual(prepared.preparation.record);
    expect(prepared.preparation.record.sourceInventory[0]?.sourceLocator).toEqual(bareHeadingLocator);
  });

  it("resumes the exact stored locator idempotently without a second create", async () => {
    const first = harness();
    const prepared = await prepareDecomposeRetirement(first.ctx, scope, allocation, "version-absent");
    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared") return;

    const retry = harness({ version: "version-prepared", state: "prepared-decompose" });
    retry.record = first.record;
    retry.staged = first.staged;
    const result = await prepareDecomposeRetirement(retry.ctx, scope, allocation, "version-prepared");

    expect(result).toEqual(prepared);
    expect(retry.operations).toEqual([]);
  });

  it("resumes after mutation when every staged path was admitted by the preparation", async () => {
    const first = harness();
    const prepared = await prepareDecomposeRetirement(first.ctx, scope, allocation, "version-absent");
    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared") return;

    const retry = harness({ version: "version-prepared", state: "prepared-decompose" });
    retry.record = first.record;
    retry.staged = [
      resolveRetirementRecordRelativePath(prepared.preparation.locator.receiptId),
      ...projection.allowedPaths,
    ];

    await expect(
      prepareDecomposeRetirement(retry.ctx, scope, allocation, "version-prepared"),
    ).resolves.toEqual(prepared);
    expect(retry.operations).toEqual([]);

    retry.staged.push("unrelated.md");
    await expect(
      prepareDecomposeRetirement(retry.ctx, scope, allocation, "version-prepared"),
    ).resolves.toMatchObject({ status: "refused", reason: "authority-conflict" });
  });

  it("refuses changed authority, coverage, map, and pre-existing staged paths", async () => {
    expect(await prepareDecomposeRetirement(harness().ctx, scope, allocation, "stale")).toMatchObject({
      status: "refused",
      reason: "authority-conflict",
    });
    const missing = { ...allocation, sourceAllocations: [] };
    expect(await prepareDecomposeRetirement(harness().ctx, scope, missing, "version-absent")).toMatchObject({
      status: "refused",
      reason: "conservation-unproven",
    });
    const misroutedShared: DecomposeAllocationMap = {
      ...allocation,
      sourceAllocations: allocation.sourceAllocations.map((source) => ({
        ...source,
        ownership: "cohort-shared",
      })),
    };
    expect(
      await prepareDecomposeRetirement(harness().ctx, scope, misroutedShared, "version-absent"),
    ).toMatchObject({ status: "refused", reason: "conservation-unproven" });
    const dirty = harness();
    dirty.staged = ["unrelated.md"];
    expect(await prepareDecomposeRetirement(dirty.ctx, scope, allocation, "version-absent")).toMatchObject({
      status: "refused",
      reason: "authority-conflict",
    });

    const existing = harness({ version: "version-prepared", state: "prepared-decompose" });
    existing.record = canonicalize({ different: true });
    expect(await prepareDecomposeRetirement(existing.ctx, scope, allocation, "version-prepared")).toMatchObject({
      status: "refused",
      reason: "authority-conflict",
    });
  });

  it("removes a newly created record after staging failure, or leaves it directly discoverable", async () => {
    const removable = harness();
    removable.failStage = true;
    expect(await prepareDecomposeRetirement(removable.ctx, scope, allocation, "version-absent")).toMatchObject({
      status: "refused",
      reason: "authority-unavailable",
    });
    expect(removable.record).toBeNull();

    const discoverable = harness();
    discoverable.failStage = true;
    discoverable.failRemove = true;
    expect(await prepareDecomposeRetirement(discoverable.ctx, scope, allocation, "version-absent")).toMatchObject({
      status: "refused",
      reason: "authority-unavailable",
    });
    const id = receiptId({
      schemaVersion: 1,
      subject: scope.subject,
      transition: "decompose",
      sourceBranch: scope.source.branch,
      sourceHead: scope.source.head,
    });
    expect(discoverable.record).not.toBeNull();
    expect(resolveRetirementRecordRelativePath(id)).toMatch(/retirement-receipts/);
  });
});
