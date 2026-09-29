/** Unit coverage for persisted and normalized local sync-state schemas. */

import { describe, expect, expectTypeOf, it } from "vitest";
import { assertSchemaRefuses } from "../../helpers/schema-assertion.js";
import { z } from "zod";

import {
  CrossWuEntryParseSchema,
  CrossWuEntrySchema,
  LocalSyncStateSchema,
  PersistedLocalSyncStateSchema,
  normalizeLocalSyncState,
  type CrossWuEntry,
  type EntryParse,
  type LocalSyncState,
  type PartialPushMarker,
} from "../../../src/lib/user-sync/schema.js";
import type { CrossWuShape } from "../../../src/lib/user-sync/types.js";

const base = {
  materializedManifestHash: "manifest",
  sourceCommit: "commit",
  sourceOperation: "save",
} as const;

describe("CrossWuEntrySchema", () => {
  it.each(["Memories", "Errand", "Work Unit"] as const)("accepts the %s section", (section) => {
    const value = { section, key: "entry", raw: "preserved block" };

    expect(CrossWuEntrySchema.parse(value)).toEqual(value);
  });

  it.each([
    { section: "Unknown", key: "entry", raw: "preserved block" },
    { section: "Memories", key: "", raw: "preserved block" },
    { section: "Memories", key: "entry", raw: "" },
    { section: "Memories", key: "entry", raw: "preserved block", extra: true },
  ])("rejects an invalid entry %#", (value) => {
    assertSchemaRefuses(CrossWuEntrySchema, value);
  });
});

describe("CrossWuEntryParseSchema", () => {
  it("accepts the success arm", () => {
    const value = { ok: true, entry: { section: "Memories", key: "entry", raw: "preserved block" } } as const;

    expect(CrossWuEntryParseSchema.parse(value)).toEqual(value);
  });

  it("accepts the failure arm", () => {
    const value = { ok: false, reason: "malformed entry" } as const;

    expect(CrossWuEntryParseSchema.parse(value)).toEqual(value);
  });

  it.each([
    { ok: true, entry: { section: "Memories", key: "", raw: "preserved block" } },
    { ok: false, reason: "" },
    { ok: false, reason: "malformed entry", extra: true },
  ])("rejects an invalid parse outcome %#", (value) => {
    assertSchemaRefuses(CrossWuEntryParseSchema, value);
  });

  it("derives the public adapter types", () => {
    expectTypeOf<CrossWuEntry>().toEqualTypeOf<z.infer<typeof CrossWuEntrySchema>>();
    expectTypeOf<EntryParse>().toEqualTypeOf<z.infer<typeof CrossWuEntryParseSchema>>();
    expectTypeOf<CrossWuShape>().toEqualTypeOf<"working-memory" | "user-inbox">();
  });
});

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

describe("normalizeLocalSyncState", () => {
  it.each([2, 3, 4] as const)("hydrates persisted version %s to the same version-4 base", (version) => {
    const persisted = PersistedLocalSyncStateSchema.parse({ version, ...base });
    expect(normalizeLocalSyncState(persisted)).toEqual({ version: 4, ...base });
  });

  it("retains every independently valid known extension", () => {
    const extensions = {
      savedAt: "saved",
      verifiedAt: "verified",
      notesRefTip: "tip",
      partialPush: { localRefHash: "notes", sourceCommit: "source" },
      partialPushErrand: { localRefHash: "errand", sourceCommit: "errand-source" },
      priorFileList: ["one", "two"],
      remoteMarkerProvenance: { worktree: { arbitrary: true } },
    };
    const persisted = PersistedLocalSyncStateSchema.parse({ version: 2, ...base, ...extensions });

    expect(normalizeLocalSyncState(persisted)).toEqual({ version: 4, ...base, ...extensions });
  });

  it("drops malformed extensions without losing valid siblings", () => {
    const persisted = PersistedLocalSyncStateSchema.parse({
      version: 3,
      ...base,
      savedAt: 42,
      verifiedAt: "verified",
      notesRefTip: "",
      partialPush: { localRefHash: "", sourceCommit: "source" },
      partialPushErrand: { localRefHash: "errand", sourceCommit: "errand-source" },
      priorFileList: ["one", 2],
      remoteMarkerProvenance: [],
      futureExtension: true,
    });

    expect(normalizeLocalSyncState(persisted)).toEqual({
      version: 4,
      ...base,
      verifiedAt: "verified",
      partialPushErrand: { localRefHash: "errand", sourceCommit: "errand-source" },
    });
  });

  it("never exposes a legacy machine id or unknown additive field", () => {
    const persisted = PersistedLocalSyncStateSchema.parse({
      version: 4,
      ...base,
      machineId: "legacy",
      futureExtension: { value: true },
    });

    expect(normalizeLocalSyncState(persisted)).toEqual({ version: 4, ...base });
    expect(LocalSyncStateSchema.parse(normalizeLocalSyncState(persisted))).toEqual({ version: 4, ...base });
  });
});
