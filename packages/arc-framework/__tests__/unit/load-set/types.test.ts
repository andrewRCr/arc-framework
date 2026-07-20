import { describe, expect, it } from "vitest";

import {
  LOAD_SET_MANIFEST_VERSION,
  LoadSetManifestReaderSchema,
  LoadSetManifestSchema,
  LoadSetPathSchema,
  type LoadSetManifest,
  type LoadSetManifestVersion,
} from "../../../src/lib/load-set/types.js";

describe("LoadSetManifest", () => {
  it("pins the manifest vocabulary to schema version 1", () => {
    const version: LoadSetManifestVersion = 1;

    expect(version).toBe(LOAD_SET_MANIFEST_VERSION);
  });

  it("accepts the session-init read disciplines in ordered entries", () => {
    const manifest = {
      manifestVersion: LOAD_SET_MANIFEST_VERSION,
      entries: [
        {
          path: "context/full-document.md",
          readMode: { kind: "full" },
        },
        {
          path: "context/sectioned-document.md",
          readMode: {
            kind: "partial-section",
            heading: "Environment & Path Context",
          },
        },
        {
          path: "context/task-list.md",
          readMode: { kind: "partial-strategic" },
        },
      ],
    } satisfies LoadSetManifest;

    expect(manifest.manifestVersion).toBe(LOAD_SET_MANIFEST_VERSION);
    expect(manifest.entries.map((entry) => entry.readMode.kind)).toEqual([
      "full",
      "partial-section",
      "partial-strategic",
    ]);
    expect(LoadSetManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it.each([
    ".arc/active/tasks-fixture.md",
    "/workspace/.arc/user/test-user/WORKING-MEMORY.md",
    "C:\\workspace\\.arc\\user\\test-user\\WORKING-MEMORY.md",
    "\\\\server\\share\\.arc\\user\\test-user\\WORKING-MEMORY.md",
  ])("accepts the established load-set path domain: %s", (path) => {
    expect(LoadSetPathSchema.parse(path)).toBe(path);
  });

  it.each([
    "../escape.md",
    ".arc//double.md",
    "/workspace/../escape.md",
    "C:\\workspace\\..\\escape.md",
    "\\\\server\\share\\..\\escape.md",
  ])("rejects unsafe or non-canonical load-set paths: %s", (path) => {
    expect(LoadSetPathSchema.safeParse(path).success).toBe(false);
  });

  it("rejects strict branch-field leakage and malformed read-mode fields", () => {
    const base = {
      manifestVersion: LOAD_SET_MANIFEST_VERSION,
      entries: [{ path: "context.md", readMode: { kind: "full" } }],
    };
    expect(LoadSetManifestSchema.safeParse({ ...base, extra: true }).success).toBe(false);
    expect(LoadSetManifestSchema.safeParse({
      ...base,
      entries: [{ path: "context.md", readMode: { kind: "full", heading: "leak" } }],
    }).success).toBe(false);
    expect(LoadSetManifestSchema.safeParse({
      ...base,
      entries: [{ path: "context.md", readMode: { kind: "partial-section", heading: " " } }],
    }).success).toBe(false);
    expect(LoadSetManifestSchema.safeParse({ ...base, manifestVersion: 2 }).success).toBe(false);
  });

  it("strips reader unknown keys recursively while preserving entry order", () => {
    const parsed = LoadSetManifestReaderSchema.parse({
      manifestVersion: LOAD_SET_MANIFEST_VERSION,
      ignored: true,
      entries: [
        { path: "first.md", ignored: true, readMode: { kind: "full", ignored: true } },
        {
          path: "second.md",
          readMode: { kind: "partial-section", heading: "Section", ignored: true },
        },
      ],
    });
    expect(parsed).toEqual({
      manifestVersion: LOAD_SET_MANIFEST_VERSION,
      entries: [
        { path: "first.md", readMode: { kind: "full" } },
        { path: "second.md", readMode: { kind: "partial-section", heading: "Section" } },
      ],
    });
  });
});
