/** Unit coverage for persisted and normalized local sync-state schemas. */

import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import {
  LocalSyncStateSchema,
  PersistedLocalSyncStateSchema,
  type LocalSyncState,
  type PartialPushMarker,
} from "../../../src/lib/user-sync/schema.js";

const base = {
  materializedManifestHash: "manifest",
  sourceCommit: "commit",
  sourceOperation: "save",
} as const;

describe("PersistedLocalSyncStateSchema", () => {
  it.each([2, 3, 4] as const)("accepts the version %s required record", (version) => {
    expect(PersistedLocalSyncStateSchema.parse({ version, ...base })).toEqual({ version, ...base });
  });

  it.each([
    { ...base, version: 1 },
    { ...base, version: 4, materializedManifestHash: "" },
    { ...base, version: 4, sourceCommit: "" },
    { ...base, version: 4, sourceOperation: "merge" },
  ])("rejects malformed required state %#", (value) => {
    expect(PersistedLocalSyncStateSchema.safeParse(value).success).toBe(false);
  });

  it("does not impose lexical formats on non-empty basis fields", () => {
    expect(PersistedLocalSyncStateSchema.safeParse({
      version: 2,
      materializedManifestHash: "not a digest",
      sourceCommit: "not an oid",
      sourceOperation: "load",
    }).success).toBe(true);
  });

  it("accepts malformed known extensions and unknown additive fields", () => {
    expect(PersistedLocalSyncStateSchema.parse({
      version: 3,
      ...base,
      savedAt: 42,
      partialPush: "malformed",
      priorFileList: ["valid", 7],
      remoteMarkerProvenance: [],
      machineId: "legacy",
      futureExtension: { retainedAtIngress: true },
    })).toMatchObject({ machineId: "legacy", futureExtension: { retainedAtIngress: true } });
  });

  it("projects without transforms or refinements", () => {
    expect(() => z.toJSONSchema(PersistedLocalSyncStateSchema)).not.toThrow();
  });
});

describe("LocalSyncStateSchema", () => {
  it("accepts a strict version-4 record with every valid extension", () => {
    const value = {
      version: 4,
      ...base,
      savedAt: "saved",
      verifiedAt: "verified",
      notesRefTip: "tip",
      partialPush: { localRefHash: "notes", sourceCommit: "source" },
      partialPushErrand: { localRefHash: "errand", sourceCommit: "errand-source" },
      priorFileList: ["one", "two"],
      remoteMarkerProvenance: { worktree: { arbitrary: true } },
    } as const;

    expect(LocalSyncStateSchema.parse(value)).toEqual(value);
  });

  it.each([
    { ...base, version: 3 },
    { ...base, version: 4, savedAt: "" },
    { ...base, version: 4, partialPush: { localRefHash: "", sourceCommit: "source" } },
    { ...base, version: 4, priorFileList: ["one", 2] },
    { ...base, version: 4, remoteMarkerProvenance: [] },
    { ...base, version: 4, machineId: "legacy" },
    { ...base, version: 4, futureExtension: true },
  ])("rejects an invalid normalized producer record %#", (value) => {
    expect(LocalSyncStateSchema.safeParse(value).success).toBe(false);
  });

  it("derives the public record and marker types", () => {
    expectTypeOf<LocalSyncState>().toEqualTypeOf<z.infer<typeof LocalSyncStateSchema>>();
    expectTypeOf<PartialPushMarker>().toMatchTypeOf<{ localRefHash: string; sourceCommit: string }>();
  });
});
